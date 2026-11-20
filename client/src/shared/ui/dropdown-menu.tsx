import { IconCheck } from '@tabler/icons-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style DropdownMenu (Radix), hand-written (not CLI-generated —
 * see AUTH-1's summary for why) and restyled to the design tokens. Radix
 * owns focus trapping, roving keyboard nav (arrow keys/Home/End/Escape),
 * and outside-click/blur dismissal — not reimplemented here, same reasoning
 * as Avatar's use of @radix-ui/react-avatar.
 */
function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = 'end',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'shadow-menu z-50 w-60 rounded-[10px] border-hairline border-border-strong bg-surface-2 p-1.5',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-2 text-2sm font-medium text-text-primary outline-none select-none',
        'data-[highlighted]:bg-surface-1',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('border-hairline-t my-1.5 border-border', className)}
      {...props}
    />
  );
}

/**
 * A menu row that is a checkbox (CLIENT-GROUP-SESSION-2's status filters). Radix owns the `role="menuitemcheckbox"`, the
 * `aria-checked` state and the keyboard; the check mark shows only while checked, never colour alone. A caller that wants the
 * menu to stay open while ticking several rows passes `onSelect={(event) => event.preventDefault()}`.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-2 text-2sm font-medium text-text-primary outline-none select-none',
        'data-[highlighted]:bg-surface-1',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="border-hairline flex size-4 shrink-0 items-center justify-center rounded border-border-strong bg-surface-2"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck className="size-3 text-text-accent" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
};
