[![Typecheck](https://github.com/subroutinecom/subroutine/actions/workflows/typecheck.yml/badge.svg?branch=main)](https://github.com/subroutinecom/subroutine/actions/workflows/typecheck.yml)
[![Tests](https://github.com/subroutinecom/subroutine/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/subroutinecom/subroutine/actions/workflows/test.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg)](LICENSE)

# Subroutine

## Setup

1. **Configuration**: Copy `example.config.yaml` to `config.yaml` and configure.

2. **Secrets**: Copy `api/.env.example` to `api/.env` and add API keys/credentials for your chosen provider

3. **Dependencies**: Run `pnpm install` from the repo root (Corepack honors the pinned pnpm version from `package.json`). This hydrates `node_modules` for every workspace member so `deno task ...` can reuse the same vetted npm packages.

## Package management

pnpm installs all dependencies and workspace members in parallel. Deno is only used as our runtime.
