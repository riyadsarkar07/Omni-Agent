# Contributing to OmniAgent AI Platform

We welcome community contributions, bug reports, and enhancements.

---

## Development Workflow

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your local `.env.local` file with a valid `GEMINI_API_KEY`.
4. Run tests and linting:
   ```bash
   npm run lint
   npm run build
   ```
5. Commit your changes using conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
6. Submit a Pull Request.

---

## Coding Standards

* **TypeScript**: Strict types throughout; no unhandled `any`.
* **Server-side Security**: All AI model calls and key verifications must remain server-side.
* **UI Components**: Tailwind CSS with dark-mode aesthetic and Lucide icons.
