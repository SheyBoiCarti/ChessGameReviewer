import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppTopBar } from '@/components/workspace/AppTopBar';

describe('AppTopBar', () => {
  it('renders a banner named "Local Chess Game Reviewer" with visible viewTitle as h1', () => {
    render(<AppTopBar viewTitle="Games" onOpenImport={vi.fn()} />);

    const header = screen.getByRole('banner', { name: 'Local Chess Game Reviewer' });
    expect(header).toBeInTheDocument();

    const heading = screen.getByRole('heading', { level: 1, name: 'Games' });
    expect(heading).toBeInTheDocument();
  });

  it('invokes onOpenMenu when Menu button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenMenu = vi.fn();
    render(<AppTopBar viewTitle="Games" onOpenMenu={onOpenMenu} onOpenImport={vi.fn()} />);

    const menuBtn = screen.getByRole('button', { name: /open menu/i });
    await user.click(menuBtn);
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });

  it('invokes onOpenImport when Import games button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenImport = vi.fn();
    render(<AppTopBar viewTitle="Review" onOpenImport={onOpenImport} />);

    const importBtn = screen.getByRole('button', { name: /import games/i });
    await user.click(importBtn);
    expect(onOpenImport).toHaveBeenCalledOnce();
  });

  it('opens the complete local-data disclosure in a modal when aboutOpen is true', async () => {
    const user = userEvent.setup();
    const onCloseAbout = vi.fn();

    const { rerender } = render(
      <AppTopBar viewTitle="Games" aboutOpen={false} onCloseAbout={onCloseAbout} />
    );

    expect(screen.queryByRole('dialog', { name: /about this app/i })).toBeNull();

    rerender(<AppTopBar viewTitle="Games" aboutOpen={true} onCloseAbout={onCloseAbout} />);

    const dialog = screen.getByRole('dialog', { name: /about this app/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(
      /This application is completely unaffiliated with Chess\.com\./i
    );
    expect(dialog).toHaveTextContent(
      /official Chess\.com Published Data API via browser CORS requests/i
    );
    expect(dialog).toHaveTextContent(/stored locally on your device in browser IndexedDB/i);
    expect(dialog).toHaveTextContent(/ever uploaded to any server/i);

    await user.keyboard('{Escape}');
    expect(onCloseAbout).toHaveBeenCalledOnce();
  });
});
