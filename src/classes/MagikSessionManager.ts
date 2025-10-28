import { getState } from '../state';

export class MagikSessionManager {
    static activeSession() {
        getState('MAGIK_SESSION_PID')
    }
}