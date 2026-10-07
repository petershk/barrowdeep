// @ts-check
// The one global namespace. First script loaded; every other file registers into BD.<layer>.
// eslint-disable-next-line no-var
var BD = (globalThis.BD = globalThis.BD || { core: {}, data: {}, sim: {}, view: {}, audio: {}, ui: {}, input: {}, debug: {} });
