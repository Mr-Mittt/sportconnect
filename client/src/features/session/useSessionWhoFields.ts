import { useState } from 'react';
import type { UpdateSessionPayload } from './types';
import { exceedsOpenSlots, isByGender, type WhoCanJoin } from '@/shared/lib/sessionSlots';

export interface WhoInitialValues {
  /** The taken slots as typed (blank = the creator alone). */
  taken: string;
  open: string;
  maleSlots: number | null;
  femaleSlots: number | null;
  gameMood: number;
  autoApprove: boolean;
}

/**
 * The Who section's draft (CLIENT-SESSION-34), shared by the create form and the detail modal's Who
 * editor. Switching to "Anyone" clears both gender counts; un-ticking a gender clears its number.
 * `capacity` / `initialSlot` follow the create form's rule: capacity = taken + open, with a blank
 * "Taken slot" meaning the creator alone (1), and `initialSlot` = taken - 1 (the creator's own row
 * already counts for one). `maleSlots` / `femaleSlots` are what the server should store: a number
 * above 0, or 0 for "not specified" (which clears it on an update).
 */
export function useSessionWhoFields(initial: WhoInitialValues) {
  const [taken, setTaken] = useState(initial.taken);
  const [open, setOpen] = useState(initial.open);
  const startsByGender = isByGender(initial.maleSlots, initial.femaleSlots);
  const [whoCanJoin, setWhoCanJoinState] = useState<WhoCanJoin>(startsByGender ? 'BY_GENDER' : 'ANYONE');
  const [maleChecked, setMaleCheckedState] = useState((initial.maleSlots ?? 0) > 0);
  const [male, setMale] = useState((initial.maleSlots ?? 0) > 0 ? String(initial.maleSlots) : '');
  const [femaleChecked, setFemaleCheckedState] = useState((initial.femaleSlots ?? 0) > 0);
  const [female, setFemale] = useState((initial.femaleSlots ?? 0) > 0 ? String(initial.femaleSlots) : '');
  const [gameMood, setGameMood] = useState(initial.gameMood);
  const [autoApprove, setAutoApprove] = useState(initial.autoApprove);

  const setWhoCanJoin = (next: WhoCanJoin) => {
    setWhoCanJoinState(next);
    if (next === 'ANYONE') {
      setMaleCheckedState(false);
      setMale('');
      setFemaleCheckedState(false);
      setFemale('');
    }
  };
  const setMaleChecked = (next: boolean) => {
    setMaleCheckedState(next);
    if (!next) setMale('');
  };
  const setFemaleChecked = (next: boolean) => {
    setFemaleCheckedState(next);
    if (!next) setFemale('');
  };

  const effectiveTaken = taken === '' ? 1 : Number(taken);
  const openCount = open === '' ? 0 : Number(open);
  const capacity = effectiveTaken + openCount;
  const initialSlot = effectiveTaken - 1;
  const maleSlots = whoCanJoin === 'BY_GENDER' && maleChecked ? Number(male) || 0 : 0;
  const femaleSlots = whoCanJoin === 'BY_GENDER' && femaleChecked ? Number(female) || 0 : 0;
  const genderOverOpen = exceedsOpenSlots(openCount, maleSlots, femaleSlots);

  /** The fields an update sends for this section (the Who editor's Save). */
  const toUpdatePayload = (): UpdateSessionPayload => ({
    capacity,
    initialSlot,
    maleSlots,
    femaleSlots,
    gameMood,
    autoApprove,
  });

  return {
    taken,
    setTaken,
    open,
    setOpen,
    whoCanJoin,
    setWhoCanJoin,
    maleChecked,
    setMaleChecked,
    male,
    setMale,
    femaleChecked,
    setFemaleChecked,
    female,
    setFemale,
    gameMood,
    setGameMood,
    autoApprove,
    setAutoApprove,
    effectiveTaken,
    openCount,
    capacity,
    initialSlot,
    maleSlots,
    femaleSlots,
    genderOverOpen,
    toUpdatePayload,
  };
}

export type SessionWhoFields = ReturnType<typeof useSessionWhoFields>;
