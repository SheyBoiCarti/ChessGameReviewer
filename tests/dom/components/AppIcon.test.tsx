import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';

describe('AppIcon', () => {
  const iconNames: AppIconName[] = [
    'games',
    'review',
    'openings',
    'settings',
    'info',
    'menu',
    'close',
    'import',
    'first',
    'previous',
    'next',
    'last',
    'flip',
  ];

  it.each(iconNames)('renders icon "%s" with 24x24 viewBox and aria-hidden', (name) => {
    const { container } = render(<AppIcon name={name} className="custom-icon-class" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.classList.contains('custom-icon-class')).toBe(true);
    expect(svg?.getAttribute('data-icon')).toBe(name);
  });
});
