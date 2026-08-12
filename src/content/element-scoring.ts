export function getQuickPickPriority(el: HTMLElement): number {
  const tag = el.tagName;
  const role = el.getAttribute('role');
  const type = (el as HTMLInputElement).type?.toLowerCase() || '';
  const inNav = !!el.closest('nav, header, [role="navigation"], [role="banner"], [role="menubar"]');
  const inSidebar = !!el.closest('aside, [role="complementary"]');
  const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

  if (
    tag === 'A' &&
    inNav &&
    (ariaLabel.includes('home') ||
      ariaLabel.includes('logo') ||
      !!el.closest('.logo, .brand, [class*="logo"], [class*="brand"]'))
  )
    return 100;

  if (tag === 'INPUT' && (type === 'search' || type === 'text')) return 95;
  if (tag === 'TEXTAREA') return 93;
  if (role === 'searchbox' || role === 'combobox' || role === 'textbox') return 95;

  if ((tag === 'BUTTON' || role === 'button') && inNav) return 75;
  if (tag === 'A' && inNav && !inSidebar) return 70;

  if (tag === 'BUTTON' || role === 'button') return 45;
  if (tag === 'A' && !inSidebar) return 40;

  if (inSidebar) return 15;
  return 10;
}
