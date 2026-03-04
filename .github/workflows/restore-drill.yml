name: Restore Drill

on:
  schedule:
    - cron: '0 4 * * 1'
  workflow_dispatch:

jobs:
  restore-drill:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: titanbot
          POSTGRES_PASSWORD: titanbot
          POSTGRES_DB: titanbot
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U titanbot -d titanbot"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      POSTGRES_URL: postgresql://titanbot:titanbot@localhost:5432/titanbot
      POSTGRES_HOST: localhost
      POSTGRES_PORT: 5432
      POSTGRES_DB: titanbot
      POSTGRES_USER: titanbot
      POSTGRES_PASSWORD: titanbot
      POSTGRES_SSL: "false"
      SCHEMA_VERSION: "1"
      SCHEMA_VERSION_LABEL: "baseline-v1"
      BACKUP_RETENTION_DAYS: "7"

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install PostgreSQL client tools
        run: sudo apt-get update ; sudo apt-get install -y postgresql-client

      - name: Install dependencies
        run: npm ci

      - name: Apply migrations
        run: npm run migrate

      - name: Run restore drill
        run: npm run backup:drill
