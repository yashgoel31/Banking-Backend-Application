import { setupServer } from 'msw/node';

/** Every test registers the handlers it needs; unhandled requests fail the test. */
export const server = setupServer();
