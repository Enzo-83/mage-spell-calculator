(function() {
    const pages = [
        { href: 'index.html',       label: 'Calculator' },
        { href: 'wizard.html',      label: 'Wizard' },
        { href: 'storyteller.html', label: 'Storyteller' },
    ];
    const current = location.pathname.split('/').pop() || 'index.html';

    const nav = document.createElement('div');
    nav.style.cssText = `position:fixed;top:12px;right:12px;z-index:100;
        display:flex;gap:4px;background:rgba(13,13,26,0.9);
        border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px;
        backdrop-filter:blur(8px);font-family:'Noto Sans',system-ui,sans-serif;`;

    pages.forEach(({ href, label }) => {
        const a = document.createElement('a');
        const isActive = current === href;
        a.href = href;
        a.textContent = label;
        a.style.cssText = `padding:5px 10px;border-radius:5px;font-size:11px;text-decoration:none;
            color:${isActive ? '#9d4edd' : '#a0a0a0'};
            background:${isActive ? 'rgba(123,44,191,0.15)' : 'transparent'};
            font-weight:${isActive ? 700 : 400};`;
        nav.appendChild(a);
    });

    document.body.appendChild(nav);
})();
