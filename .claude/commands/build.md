Build for production and verify.

1. Run `bunx tsc --noEmit` to type-check first. Stop if there are errors.
2. Run `bunx vite build` to create production build in `dist/`.
3. Verify the build output exists and report bundle sizes.
4. Optionally start production server with `timeout 5 bun run start` to smoke-test that it boots without errors.
