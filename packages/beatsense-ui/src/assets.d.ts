// The HUDs import their stylesheets for the side effect only (webpack's style-loader in the app, tsup's injectStyle in dist), so a
// stylesheet module exports nothing.
declare module '*.css' {}
