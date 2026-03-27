# Contributing

Thanks for contributing to Oryn SDK.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Base Sepolia RPC URL for contract deployment and live examples

## Setup

1. Clone the repository.
2. Move into the package directory:

```bash
cd Oryn/oryn-sdk
```

3. Install dependencies:

```bash
npm install
```

4. Create a local environment file:

```bash
cp .env.example .env
```

5. Fill in the required values in `.env`, especially:

- `BASE_RPC_URL`
- `BASE_SEPOLIA_RPC_URL`
- `PRIVATE_KEY`
- `USDC_ADDRESS`
- `TREASURY_ADDRESS`
- `ORYN_PAYMENT_CONTRACT_ADDRESS`

## Development Workflow

Compile contracts:

```bash
npm run compile
```

Run the SDK tests:

```bash
npm run test:sdk
```

Run the contract tests:

```bash
npm run test:contracts
```

Run the full test suite:

```bash
npm test
```

Build the package:

```bash
npm run build
```

## Release Workflow

1. Update code, documentation, and changelog.
2. Run the full test suite locally.
3. Build the package locally.
4. Commit your changes.
5. Create and push a version tag such as `v0.1.0`.
6. GitHub Actions will run tests and publish to npm if the workflow has a valid `NPM_TOKEN` secret.

## Pull Requests

- Keep changes focused and explain the user-facing impact clearly.
- Add or update tests when behavior changes.
- Update `README.md` and `CHANGELOG.md` for notable changes.
- Prefer small, reviewable pull requests over large mixed changes.

