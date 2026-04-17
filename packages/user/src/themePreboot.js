// Preboot snippet injected into each app's <head> before React mounts.
// Reads the shared `geek_theme` cookie (set on .clintgeek.com by any
// GeekSuite app) and applies the resolved mode to <html data-theme>
// so the first paint matches the user's chosen theme.
//
// Kept in a pure-JS module (no JSX, no React imports) so it's safe to
// import from a Vite config — where Node's ESM loader can't handle .jsx.
export const themePrebootScript = `(function(){try{var m=document.cookie.match(/(?:^|; )geek_theme=([^;]*)/);var p=m?decodeURIComponent(m[1]):'auto';if(p==='system')p='auto';if(p!=='light'&&p!=='dark'&&p!=='auto')p='auto';var t=p==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=t;}catch(e){}})();`;
