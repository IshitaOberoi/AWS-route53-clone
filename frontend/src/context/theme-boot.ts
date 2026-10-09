// Shared between the server layout (inline script) and the client ThemeProvider.

export const THEME_STORAGE_KEY = 'r53.theme';

/**
 * Runs before React hydrates (see app/layout.tsx) so the first paint already uses the right
 * mode. It mirrors what Cloudscape's applyMode() does: toggle `awsui-dark-mode` on <body>.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.body.classList.add('awsui-dark-mode');}document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
