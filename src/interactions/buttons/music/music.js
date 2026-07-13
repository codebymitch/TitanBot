import musicButtonHandler from '../../../handlers/musicButtons.js';
import { MUSIC_BUTTON_IDS } from '../../../services/music/musicEmbeds.js';

const buttonIds = [
    MUSIC_BUTTON_IDS.PAUSE,
    MUSIC_BUTTON_IDS.RESUME,
    MUSIC_BUTTON_IDS.SKIP,
    MUSIC_BUTTON_IDS.STOP,
    MUSIC_BUTTON_IDS.SHUFFLE,
    MUSIC_BUTTON_IDS.LOOP,
    MUSIC_BUTTON_IDS.VOL_DOWN,
    MUSIC_BUTTON_IDS.VOL_UP,
    MUSIC_BUTTON_IDS.QUEUE,
    MUSIC_BUTTON_IDS.QUEUE_FIRST,
    MUSIC_BUTTON_IDS.QUEUE_PREV,
    MUSIC_BUTTON_IDS.QUEUE_NEXT,
    MUSIC_BUTTON_IDS.QUEUE_LAST,
];

export default buttonIds.map((name) => ({
    name,
    execute: musicButtonHandler.execute,
}));
