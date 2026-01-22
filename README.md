# Treant Discord Bot

A powerful Discord bot built with AWS CDK, TypeScript, and a hybrid serverless architecture. Treant combines simple fun commands with complex integrations involving Blizzard's WoW API, Gemini AI, and voice synthesis.

## Features

The bot operates under the `/treant` slash command namespace:

- **/treant judge [character]**: Analyzes a WoW Classic character's gear on the Dreamscythe realm. It fetches data from the Blizzard API and uses Google's Gemini AI to provide a "roast" or constructive analysis of their equipment.
- **/treant gold [amount]**: Checks current WoW Classic gold prices from G2G, calculates the cost for a specific amount, and displays a historical price chart. It also announces the price in voice chat.
- **/treant speak [text]**: Joins the user's voice channel and speaks the provided text using AWS Polly (Neural Engine).
- **/treant pun**: Tells a tree-related pun. (Default command)

## Architecture

This project demonstrates a robust, scalable architecture on AWS:

1.  **API Handler**: A lightweight, synchronous Lambda function that handles Discord interactions. It verifies signatures, handles PINGs, and acts as a high-throughput entry point, ensuring responses meet Discord's 3-second timeout.
2.  **Worker Lambda**: An asynchronous Lambda function that processes heavy commands (like `/judge`). It triggers off **Amazon SQS** events, allowing for longer processing times (up to 60s) without blocking the API.
3.  **Asynchronous Processing**: Long-running tasks (like AI analysis or fetching extensive API data) are offloaded to **Amazon SQS**.
4.  **Voice Worker**: A dedicated **Fargate** service listens to the SQS queue to handle persistent voice connections, which cannot be managed by ephemeral Lambda functions.
5.  **Data Storage**:
    - **Secrets Manager**: Securely stores API keys (Discord, Blizzard, Google).
    - **DynamoDB**: Stores gold price history for chart generation.

## Prerequisites

- Node.js (LTS version recommended)
- AWS CLI (configured with valid credentials)
- AWS CDK Toolkit
- Docker (for bundling Lambda assets and building the voice worker image)

## Setup & Configuration

1.  **Clone and Install**:

    ```bash
    git clone <repository-url>
    cd treant
    npm install
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in your credentials:

    ```bash
    cp .env.example .env
    ```

    - `DISCORD_PUBLIC_KEY`: From Discord Developer Portal.
    - `DISCORD_TOKEN`: Bot Token.
    - `DISCORD_CLIENT_ID`: Application ID.
    - `BLIZZARD_CLIENT_ID` & `BLIZZARD_CLIENT_SECRET`: From Battle.net Developer Portal.
    - `GOOGLE_API_KEY`: API Key for Gemini.

3.  **Deployment**:
    Deploy the stack to your AWS account.
    ```bash
    npx cdk deploy
    ```
    _Note: This will provision resources mostly in the free tier, but Fargate and NAT Gateways (if configured) may incur costs._

## Management Scripts

This project includes helper scripts to streamline configuration:

### `node update-secrets.mjs`

Updates AWS Secrets Manager with the credentials from your local `.env` file.

- **Run when**: You change keys in `.env` or after initial deployment.

### `node register-commands.mjs`

Registers the slash commands with Discord.

- **Run when**: You add or modify command definitions in `src/commands`.

## Development Commands

- `npm run build`: Compile TypeScript to JavaScript.
- `npm run watch`: Watch for changes and compile.
- `npm run test`: Perform Jest unit tests.
- `npx cdk diff`: Compare deployed stack with current state.
- `npx cdk synth`: Emit the synthesized CloudFormation template.
