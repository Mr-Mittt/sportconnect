import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MentionInput, type MentionDraft, type MentionOptionItem } from './MentionInput';

// CLIENT-GL-50 part 2: what the box tells its owner when the `@` word ends, and its multi-line mode. jsdom has no real
// caret movement over a chip: that is proven in the Playwright flows.

const people: MentionOptionItem[] = [{ id: 'u-priya', name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null }];

function setup(props: { multiline?: boolean; maxLength?: number } = {}) {
  const onQueryChange = vi.fn();
  const onSubmit = vi.fn();
  const drafts: MentionDraft[] = [];
  render(
    <MentionInput
      ariaLabel="Box"
      placeholder="Type"
      maxLength={props.maxLength ?? 100}
      options={people}
      pickerLabel="People"
      onQueryChange={onQueryChange}
      onChange={(draft) => drafts.push(draft)}
      onSubmit={onSubmit}
      multiline={props.multiline}
    />,
  );
  return { box: screen.getByRole('textbox', { name: 'Box' }), onQueryChange, onSubmit, drafts, user: userEvent.setup() };
}

describe('MentionInput: the @ word ends', () => {
  it('tells the owner the @ word typed, and that there is none after Esc', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, 'hi @Pr');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pr');
    expect(screen.getByRole('listbox', { name: 'People' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
  });

  it('does not report the old word again on the key-up of Esc, and reports the next @ word when typing resumes', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, '@Pr');
    await user.keyboard('{Escape}');
    const calls = onQueryChange.mock.calls.length;
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
    expect(onQueryChange.mock.calls.length).toBe(calls);

    await user.keyboard('i');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pri');
    expect(screen.getByRole('listbox', { name: 'People' })).toBeInTheDocument();
  });

  it('tells the owner there is no @ word at the key press of Esc itself, not only after the key-up', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, '@Pr');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pr');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
  });

  it('tells the owner there is no @ word at the blur itself', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, '@Pr');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pr');
    fireEvent.blur(box);
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
  });

  it('tells the owner there is no @ word when the box loses focus', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, '@Pr');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pr');
    await user.tab();
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
  });

  it('tells the owner there is no @ word after a pick', async () => {
    const { box, onQueryChange, user } = setup();
    await user.type(box, '@Pr');
    await user.keyboard('{Enter}');
    expect(onQueryChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toBeInTheDocument();
  });
});

describe('MentionInput: multiline', () => {
  it('Enter adds a line and never submits; the one-line box submits and adds nothing', async () => {
    const multi = setup({ multiline: true });
    await multi.user.type(multi.box, 'a');
    await multi.user.keyboard('{Enter}b');
    expect(multi.onSubmit).not.toHaveBeenCalled();
    expect(multi.drafts.at(-1)?.stored).toBe('a\nb');
    expect(multi.box).toHaveAttribute('aria-multiline', 'true');
  });

  it('single-line Enter submits and adds no line', async () => {
    const single = setup();
    await single.user.type(single.box, 'a');
    await single.user.keyboard('{Enter}');
    expect(single.onSubmit).toHaveBeenCalledTimes(1);
    expect(single.drafts.at(-1)?.stored).toBe('a');
    expect(single.box).toHaveAttribute('aria-multiline', 'false');
  });

  it('a virtual keyboard line break (an input event, not a key) adds a line in the post box and nothing in the one-line box', async () => {
    const multi = setup({ multiline: true });
    await multi.user.type(multi.box, 'a');
    const paragraph = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    expect(fireEvent(multi.box, paragraph)).toBe(false);
    expect(multi.drafts.at(-1)?.stored).toBe('a\n');
  });

  it('a virtual keyboard line break in the one-line box is refused', async () => {
    const single = setup();
    await single.user.type(single.box, 'a');
    const paragraph = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    expect(fireEvent(single.box, paragraph)).toBe(false);
    expect(single.drafts.at(-1)?.stored).toBe('a');
  });

  it('a line break counts against the limit and is refused at it', async () => {
    const multi = setup({ multiline: true, maxLength: 3 });
    await multi.user.type(multi.box, 'ab');
    await multi.user.keyboard('{Enter}');
    expect(multi.drafts.at(-1)?.stored).toBe('ab\n');
    await multi.user.keyboard('{Enter}');
    expect(multi.drafts.at(-1)?.stored).toBe('ab\n');
  });

  it('keeps pasted line breaks in the post box', async () => {
    const multi = setup({ multiline: true });
    await multi.user.click(multi.box);
    await multi.user.paste('x\ny');
    expect(multi.drafts.at(-1)?.stored).toBe('x\ny');
  });

  it('turns pasted line breaks into one blank in the one-line box', async () => {
    const single = setup();
    await single.user.click(single.box);
    await single.user.paste('x\ny');
    expect(single.drafts.at(-1)?.stored).toBe('x y');
  });
});

describe('MentionInput: the list opens at the caret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
  });

  it('puts the list under the caret when the caret can be measured', async () => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      value: () => [{ left: 100, right: 160, top: 110, bottom: 128, width: 60, height: 18 }],
      configurable: true,
      writable: true,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      top: 100,
      width: 400,
      height: 40,
    } as DOMRect);
    const { box, user } = setup();
    await user.type(box, 'hi @Pr');
    const list = screen.getByRole('listbox', { name: 'People' });
    expect(list.style.left).toBe('140px');
    expect(list.style.top).toBe('32px');
    expect(list.className).not.toContain('top-full');
  });

  it('keeps the list under the box where the caret cannot be measured', async () => {
    const { box, user } = setup();
    await user.type(box, 'hi @Pr');
    const list = screen.getByRole('listbox', { name: 'People' });
    expect(list.className).toContain('top-full');
    expect(list.style.left).toBe('');
  });
});
