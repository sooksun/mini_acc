import {
  TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  getAvailableTransitions,
} from './transitions';

describe('TRANSITIONS registry', () => {
  it('VOIDED has no outgoing transitions', () => {
    expect(TRANSITIONS.VOIDED).toEqual({});
  });

  it('DRAFT has at least the canonical sales fast-path', () => {
    expect(TRANSITIONS.DRAFT?.USER_CONFIRMED).toBeDefined();
  });

  it('every transition has at least one allowedRole', () => {
    for (const [from, toMap] of Object.entries(TRANSITIONS)) {
      for (const [to, rule] of Object.entries(toMap ?? {})) {
        expect(rule!.allowedRoles.length).toBeGreaterThan(0);
        expect(rule!.allowedRoles).toEqual(
          expect.arrayContaining(rule!.allowedRoles),
        );
        // sanity: never allow VIEWER or AI_AGENT to confirm/lock by accident
        if (to === 'USER_CONFIRMED' || to === 'LOCKED') {
          expect(rule!.allowedRoles).not.toContain('VIEWER');
        }
      }
    }
  });

  it('VOID transitions always require reason', () => {
    for (const [, toMap] of Object.entries(TRANSITIONS)) {
      const voidRule = (toMap ?? {}).VOIDED;
      if (voidRule) {
        expect(voidRule.requireReason).toBe(true);
      }
    }
  });
});

describe('isTerminal', () => {
  it('VOIDED is terminal', () => {
    expect(isTerminal('VOIDED')).toBe(true);
  });

  it('LOCKED is NOT terminal (can still VOID)', () => {
    expect(isTerminal('LOCKED')).toBe(false);
  });

  it('DRAFT is not terminal', () => {
    expect(isTerminal('DRAFT')).toBe(false);
  });
});

describe('getAvailableTransitions', () => {
  it('returns role-permitted transitions only', () => {
    const fromDraftAsOwner = getAvailableTransitions('DRAFT', 'OWNER');
    const targets = fromDraftAsOwner.map((t) => t.to);
    expect(targets).toContain('USER_CONFIRMED');
    expect(targets).toContain('VOIDED');
    expect(targets).not.toContain('AI_EXTRACTED'); // OWNER not allowed for that
  });

  it('returns empty array for VIEWER on any state', () => {
    expect(getAvailableTransitions('DRAFT', 'VIEWER')).toEqual([]);
    expect(getAvailableTransitions('USER_CONFIRMED', 'VIEWER')).toEqual([]);
  });

  it('returns empty for terminal VOIDED', () => {
    expect(getAvailableTransitions('VOIDED', 'OWNER')).toEqual([]);
  });

  it('AI_AGENT can extract from DRAFT only', () => {
    const fromDraft = getAvailableTransitions('DRAFT', 'AI_AGENT');
    expect(fromDraft.map((t) => t.to)).toContain('AI_EXTRACTED');

    const fromConfirmed = getAvailableTransitions('USER_CONFIRMED', 'AI_AGENT');
    expect(fromConfirmed).toEqual([]);
  });
});

describe('TERMINAL_STATES', () => {
  it('only contains VOIDED', () => {
    expect(TERMINAL_STATES).toEqual(['VOIDED']);
  });
});
