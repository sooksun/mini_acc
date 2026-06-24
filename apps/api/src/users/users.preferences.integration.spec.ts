import { UsersService } from './users.service';
import { bootstrapTestEnv, teardownTestEnv, TestEnv } from '../../test/setup-integration';

describe('UsersService assistant preferences (integration)', () => {
  let env: TestEnv;
  let users: UsersService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    users = env.app.get(UsersService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('defaults both assistant preferences to true', async () => {
    const prefs = await users.getPreferences(env.seed.userId);
    expect(prefs).toEqual({ assistantEnabled: true, assistantAutoAdvice: true });
  });

  it('updates only the provided preference (partial patch)', async () => {
    const after = await users.updatePreferences(env.seed.userId, { assistantAutoAdvice: false });
    expect(after).toEqual({ assistantEnabled: true, assistantAutoAdvice: false });

    // persisted + the other flag untouched
    const reread = await users.getPreferences(env.seed.userId);
    expect(reread).toEqual({ assistantEnabled: true, assistantAutoAdvice: false });

    const toggledOff = await users.updatePreferences(env.seed.userId, { assistantEnabled: false });
    expect(toggledOff).toEqual({ assistantEnabled: false, assistantAutoAdvice: false });
  });
});
