# Treant Architecture

This document describes the high-level architecture of the Treant Discord bot application.

## High-Level Overview

Treant is a serverless-first Discord bot application built on AWS. It uses a hybrid architecture:

- **Serverless (Lambda)** for handling slash commands and event-driven processing.
- **Microservices (ECS Fargate)** for long-running stateful voice connections.
- **Asynchronous Messaging (SQS)** to decouple components and handle heavy workloads.

## Architecture Diagram

```mermaid
graph TB
    subgraph "External"
        User([Discord User])
        Discord[Discord Platform]
        Blizzard[Blizzard API]
        Gemini[Google Gemini AI]
    end

    subgraph "AWS Cloud"
        subgraph "Entry Point"
            APIGW[API Gateway]
            ApiLambda["API Lambda<br/>(Node.js)"]
        end

        subgraph "Async Processing"
            CmdQueue[SQS: Command Queue]
            WorkerLambda["Worker Lambda<br/>(Node.js)"]
        end

        subgraph "Voice Service"
            VoiceQueue[SQS: Voice Queue]
            VoiceCluster[ECS Fargate Cluster]
            VoiceTask["Voice Worker Task<br/>(Container)"]
            Polly[AWS Polly]
        end

        subgraph "Storage & Config"
            DDB[("DynamoDB<br/>GoldPriceHistory")]
            Secrets[Secrets Manager]
        end
    end

    %% Flows
    User -->|Slash Command| Discord
    Discord -- "Webhook (HTTP)" --> APIGW
    APIGW -->|Invoke| ApiLambda

    %% API Lambda Logic
    ApiLambda -->|1. Acknowledge/Reply| Discord
    ApiLambda -->|"2. Dispatch Async Job (Judge/Gold)"| CmdQueue
    ApiLambda -->|3. Dispatch Voice Job| VoiceQueue
    ApiLambda -.->|Read Key| Secrets

    %% Worker Logic
    CmdQueue -->|Trigger| WorkerLambda
    WorkerLambda -->|Fetch Data| Blizzard
    WorkerLambda -->|Generate Content| Gemini
    WorkerLambda -->|Read/Write| DDB
    WorkerLambda -->|Update Interaction| Discord
    WorkerLambda -.->|Read Credentials| Secrets

    %% Voice Logic
    VoiceQueue -->|Poll| VoiceTask
    VoiceCluster -- Hosts --> VoiceTask
    VoiceTask -->|Synthesize Speech| Polly
    VoiceTask -->|Connect Voice| Discord
    VoiceTask -.->|Read Token| Secrets

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:white;
    classDef discord fill:#5865F2,stroke:#232F3E,stroke-width:2px,color:white;
    classDef ext fill:#808080,stroke:#333,stroke-width:2px,color:white;

    class APIGW,ApiLambda,CmdQueue,WorkerLambda,VoiceQueue,VoiceCluster,VoiceTask,Polly,DDB,Secrets aws;
    class Discord,User discord;
    class Blizzard,Gemini ext;
```

## Component Details

### 1. API Handler (Synchronous)

- **Resource**: AWS Lambda (`src/api.ts`)
- **Trigger**: API Gateway (HTTP)
- **Responsibility**:
  - Validates Discord Ed25519 signatures.
  - Handles "ping" interactions.
  - fast-returning commands.
  - Enqueues heavy jobs to SQS to avoid timeout (Discord requires response within 3s).

### 2. Command Worker (Asynchronous)

- **Resource**: AWS Lambda (`src/worker.ts`)
- **Trigger**: SQS (`DiscordCommandQueue`)
- **Responsibility**:
  - Handles long-running logic (e.g., fetching WoW character data, gold prices, generating AI responses).
  - Uses **Gemini AI** for analysis and **Blizzard API** for game data.
  - Persists data to **DynamoDB**.
  - Updates the original Discord interaction via webhook.

### 3. Voice Worker (Stateful)

- **Resource**: AWS ECS Fargate
- **Trigger**: SQS (`VoiceCommandQueue`)
- **Responsibility**:
  - Maintains persistent connection to Discord Voice Channels.
  - Converts text to speech using **AWS Polly**.
  - Streams audio to Discord.
  - Runs inside a VPC with public internet access (no NAT gateway cost optimization).

### 4. Data & Configuration

- **DynamoDB**: Stores time-series data for gold prices.
- **Secrets Manager**: Securely stores Discord tokens, Blizzard credentials, and API keys.
