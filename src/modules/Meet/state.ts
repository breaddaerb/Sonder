export interface SonderMeetState {
  lock?: _ZoteroTypes.PromiseObject;
  input?: string;
  storage?: any;
  codexOAuth?: { state: string; verifier: string };
}

const state: SonderMeetState = {};

export default state;
