import musicButtonHandler from '../../../handlers/musicButtons.js';

const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
};

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
