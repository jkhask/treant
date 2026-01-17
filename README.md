# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

## Project Setup & Helper Scripts

This project includes helper scripts to streamline the Discord bot setup and management.

### Prerequisites

1.  Copy `.env.example` to `.env` and fill in your credentials:

    ```bash
    cp .env.example .env
    ```

    - `DISCORD_PUBLIC_KEY`: Found in Discord Developer Portal -> General Information.
    - `DISCORD_TOKEN`: Found in Discord Developer Portal -> Bot -> Token.
    - `DISCORD_CLIENT_ID`: Found in Discord Developer Portal -> OAuth2 -> Client ID.

### Scripts

#### `node update-secrets.mjs`

Updates the AWS Secrets Manager secrets with the `DISCORD_PUBLIC_KEY`, `BLIZZARD_CLIENT_ID`, and `BLIZZARD_CLIENT_SECRET` from your local `.env` file.

- **When to run**: After initial deployment (`npx cdk deploy`) or whenever you change your credentials.
- **What it does**: Fetches the Secret Names from the deployed CloudFormation stack outputs and updates their values in AWS.

#### `node register-commands.mjs`

Registers the bot's slash commands (like `/treant`) with Discord.

- **When to run**: Whenever you add or modify commands in the `commands` array within the script.
- **What it does**: Uses the Discord REST API to overwrite the application commands for your bot.
