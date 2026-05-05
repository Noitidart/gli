# gli

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Noitidart/gli/master/install.sh | sh
```

Requires [Node.js](https://nodejs.org) and [git](https://git-scm.com).

To uninstall:

```sh
npm uninstall -g gli
```

## Dev

```sh
git clone <repo>
cd gli
nvm use  # ensure correct Node version
npm install
npm run dev
```

The TUI takes over the terminal (raw mode), so file watching is not used. Edit code, then re-run `npm run dev` to test changes.
