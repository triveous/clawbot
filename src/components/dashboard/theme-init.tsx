// Inlined script that applies the persisted theme before paint so the
// dashboard never flashes the wrong palette. Rendered once in the layout.

export function ThemeInit() {
  const src = `
    (function(){
      try {
        var t = localStorage.getItem('cb:theme') || 'dark';
        if (t === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      } catch (_) {
        document.documentElement.classList.add('dark');
      }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: src }} />;
}
