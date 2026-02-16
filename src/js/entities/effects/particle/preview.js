import { render } from './render/Particle.js';

export const manifest = {
    id: 'particle',
    name: 'Particles',
    description: 'Visual effects for collect, death, bonus.',
    category: 'effects',
    tags: [],
    configKey: 'particles',
};

export const defaults = { type: 'bubble', count: 8 };

export const renderControls = [
    {
        key: 'type', type: 'select',
        options: [
            { value: 'bubble', label: 'Bubble Collect' },
            { value: 'death', label: 'Death Splash' },
            { value: 'golden', label: 'Golden Fish' },
        ],
        value: 'bubble', label: 'Type',
    },
    { key: 'count', type: 'range', min: 4, max: 20, value: 8, label: 'Count' },
];

export const versions = [
    {
        meta: { version: '001', name: 'Particles', current: true },
        preview: (ctx, w, h, frame, state) => render(ctx, w, h, frame, state.type, state.count),
    },
];
