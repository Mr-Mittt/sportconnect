import type { ClassKey } from 'keycloakify/login';

/*
 * Keycloak's class keys -> the client's design tokens. With the default CSS off, this map IS the
 * stylesheet for every stock page; whatever a utility cannot express is in ../theme.css.
 */
const input =
  'h-auto w-full rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary outline-none transition-[box-shadow,border-color] placeholder:text-text-muted focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent disabled:cursor-not-allowed disabled:opacity-50';
const button =
  'inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-2sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:pointer-events-none disabled:opacity-50';
const outline = 'border-hairline border-border-strong bg-transparent text-text-primary hover:bg-surface-1';

export const classes = {
  kcFormClass: 'flex flex-col',
  kcFormGroupClass: 'mb-4',
  // Keycloakify renders the required-field asterisk as a bare text node after the label, inside
  // the wrapper: the wrapper carries the type style and the label stays inline so they share a line.
  kcLabelWrapperClass: 'mb-1.5 text-xs font-medium text-text-secondary',
  kcLabelClass: 'inline-block text-xs font-medium text-text-secondary',
  kcInputWrapperClass: '',
  kcInputClass: input,
  kcInputGroup: 'relative',
  kcInputErrorMessageClass: 'mt-1.5 block text-2xs text-text-danger',
  // The glyph font is not shipped, so the eye is drawn by theme.css (.kc-eye / .kc-eye-off).
  kcFormPasswordVisibilityIconShow: 'kc-eye',
  kcFormPasswordVisibilityIconHide: 'kc-eye-off',
  kcFormPasswordVisibilityButtonClass:
    'absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted hover:text-text-primary',
  kcFormOptionsClass: 'mb-4 flex justify-between text-2sm',
  kcFormOptionsWrapperClass: 'text-2xs text-text-accent',
  kcFormSettingClass: 'mb-4 flex items-center justify-between text-2sm text-text-secondary',
  kcFormButtonsClass: 'mt-2 flex flex-col gap-2',
  kcFormButtonsWrapperClass: 'flex flex-col gap-2',
  kcButtonClass: button,
  kcButtonPrimaryClass: 'bg-accent-solid text-white hover:opacity-90',
  kcButtonDefaultClass: outline,
  kcButtonSecondaryClass: outline,
  kcButtonBlockClass: 'w-full',
  kcButtonLargeClass: '',
  kcSelectAuthListClass: 'flex flex-col gap-2',
  kcSelectAuthListItemClass:
    'flex w-full cursor-pointer items-center gap-3 rounded-lg border-hairline border-border-strong bg-surface-2 p-3 text-left text-text-primary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
  // The pficon glyph font is not shipped (default CSS is off): hide the empty icon boxes.
  kcSelectAuthListItemIconClass: 'hidden',
  kcSelectAuthListItemIconPropertyClass: 'hidden',
  kcSelectAuthListItemArrowClass: 'hidden',
  kcSelectAuthListItemArrowIconClass: 'hidden',
  kcSelectAuthListItemFillClass: 'flex-1',
  kcSelectAuthListItemBodyClass: 'flex-1',
  kcSelectAuthListItemTitle: 'block',
  kcSelectAuthListItemHeadingClass: 'text-2sm font-medium text-text-primary',
  kcSelectAuthListItemDescriptionClass: 'mt-0.5 text-2xs text-text-secondary',
  kcAlertClass: 'mb-4',
  kcCheckClass: 'kc-choice mb-3 text-2sm text-text-secondary',
  kcCheckInputClass: 'size-4 accent-accent-solid',
  kcCheckLabelClass: 'text-2sm text-text-secondary',
  kcInputClassCheckbox: 'kc-choice mb-2',
  kcInputClassCheckboxInput: 'size-4 accent-accent-solid',
  kcInputClassCheckboxLabel: 'text-2sm text-text-secondary',
  kcInputClassRadio: 'kc-choice mb-2',
  kcInputClassRadioInput: 'size-4 accent-accent-solid',
  kcInputClassRadioLabel: 'text-2sm text-text-secondary',
  kcLoginOTPListClass: 'mb-4 flex flex-col gap-2',
  kcLoginOTPListInputClass: 'size-4 accent-accent-solid',
  kcRecoveryCodesList: 'kc-code mb-4 grid list-none grid-cols-2 gap-1 text-2sm',
  kcRecoveryCodesActions: 'mb-4 flex flex-wrap gap-4',
  kcRecoveryCodesConfirmation: 'mb-3',
  kcRecoveryCodesWarning: 'mb-4',
} satisfies { [key in ClassKey]?: string };
