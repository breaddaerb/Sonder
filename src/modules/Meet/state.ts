export interface SonderMeetState {
  lock?: _ZoteroTypes.PromiseObject;
  input?: string;
  popupWin?: any;
  storage?: any;
  codexOAuth?: { state: string; verifier: string };
}

const state: SonderMeetState = {};

export default state;
