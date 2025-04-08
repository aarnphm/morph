# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- Development: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Format check: `pnpm format:check`
- Database migrations: `pnpm migrate`

## Code Style Guidelines

- TypeScript with strict typing (avoid `any` when possible)
- Use Next.js and React best practices with functional components
- Format: 100 char width, single quotes, no semicolons, trailing commas
- Naming: camelCase for variables/functions, PascalCase for components/classes, and snake-case for filenames.
- Imports: Follow order - React/Next imports first, then external libs, internal modules
- Error handling: Prefer early returns over deep nesting
- Component organization: Keep components focused on single responsibility
- Performance: Use memoization where appropriate, ensure proper cleanup in useEffect

## Architecture

- Next.js frontend with TypeScript
- DrizzleORM for database operations
- React Context for state management
- Follow existing patterns when adding new components or features
