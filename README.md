# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.14.1 create --template minimal --types ts --add prettier eslint playwright tailwindcss="plugins:none" sveltekit-adapter="adapter:auto" drizzle="database:postgresql+postgresql:postgres.js+docker:yes" better-auth="demo:password,github" --install npm tslam
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

1: cd tslam │
│ 2: npm run dev -- --open │
│ │
│ To close the dev server, hit Ctrl-C │
│ │
│ 🧩 Add-on steps │
│ │
│ playwright: │
│ - Run npx playwright install to download browsers │
│ - Visit /demo/playwright to see the demo page │
│ - Run npm run test:e2e to execute the example tests │
│ drizzle: │
│ - Run npm run db:start to start the docker container │
│ - Run npm run db:push to update your database schema │
│ better-auth: │
│ - Run npm run auth:schema to generate the auth schema │
│ - Run npm run db:push to update your database │
│ - Check ORIGIN & BETTER_AUTH_SECRET in .env and adjust it to your needs │
│ - Set your GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env │
│ - Visit /demo/better-auth route to view the demo
