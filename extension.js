
(function (Scratch) {
    'use strict';

    class Cozmo {
        constructor(runtime) {
            this.runtime = runtime;
            this.ws = null;
            this.connecting = false;
            this.url = 'ws://localhost:26966';
            this._stateWaiters = [];
            this._callResolvers = new Map();
            this._backpack = ['off','off','off','off','off'];
            this._lastState = null;
            this._lastStateTs = 0;
            this._verbose = true; 
            try {
                if (typeof localStorage !== 'undefined') {
                    const stored = localStorage.getItem('Cozmo_verbose');
                    this._verbose = stored !== '0'; 
                }
            } catch (e) { }
            this._connect();
        }

        getInfo() {
            const makeBlock = (opcode, text, args = {}, blockType = Scratch.BlockType.COMMAND) => ({
                opcode,
                blockType,
                text,
                arguments: args
            });

            const makeReporter = (opcode, text, args = {}) => makeBlock(opcode, text, args, Scratch.BlockType.REPORTER);

            const makeBoolean = (opcode, text, args = {}) => makeBlock(opcode, text, args, Scratch.BlockType.BOOLEAN);

            const makeAsyncBlock = (opcode, text, specificArgs = {}) => makeBlock(opcode, text, { ...specificArgs, ...commonArgs });

            const makeSensorBlock = (type, opcode, text) => type === 'boolean' ? makeBoolean(opcode, text) : makeReporter(opcode, text);

            const commonArgs = {
                IN_PARALLEL: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'False' },
                AWAIT: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' }
            };

            return {
                id: 'Cozmo',
                name: 'Cozmo',
                blocks: [
                    makeAsyncBlock('drive_straight', 'drive [DISTANCE]mm at [SPEED]mm/s play animation [PLAY_ANIM] parallel [IN_PARALLEL] await [AWAIT]', {
                        DISTANCE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                        SPEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
                        PLAY_ANIM: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' }
                    }),
                    makeBlock('drive_wheels', 'drive wheels left [LEFT]mm/s right [RIGHT]mm/s duration [DURATION]s await [AWAIT]', {
                        LEFT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
                        RIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
                        DURATION: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
                        AWAIT: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' }
                    }),
                    makeBlock('stop_all_motors', 'stop all motors'),
                    makeBlock('abort_all_actions', 'abort all actions'),

                    makeAsyncBlock('turn_in_place', 'turn [ANGLE]° at [SPEED]°/s parallel [IN_PARALLEL] await [AWAIT]', {
                        ANGLE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 90 },
                        SPEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 90 }
                    }),

                    makeAsyncBlock('set_head_angle', 'set head to [PERCENT]% duration [DURATION]s parallel [IN_PARALLEL] await [AWAIT]', {
                        PERCENT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
                        DURATION: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                    }),
                    makeAsyncBlock('set_lift_height', 'set lift to [HEIGHT]% speed [DURATION] parallel [IN_PARALLEL] await [AWAIT]', {
                        HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 20 },
                        DURATION: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                    }),

                    makeBlock('set_backpack_preset', 'set backpack LEDs [PRESET]', {
                        PRESET: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_PRESET', defaultValue: 'red' }
                    }),
                    makeBlock('set_backpack_preset_pattern', 'set backpack LEDs pattern [PATTERN] R [R] G [G] B [B] on_ms [ON] off_ms [OFF] trans_on [TON] trans_off [TOFF]', {
                        PATTERN: { type: Scratch.ArgumentType.STRING, menu: 'LIGHT_PATTERNS', defaultValue: 'flash' },
                        R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        G: { type: Scratch.ArgumentType.NUMBER, defaultValue: 255 },
                        B: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        ON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 500 },
                        OFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                        TON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 250 },
                        TOFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 750 }
                    }),
                    makeBlock('set_backpack_led', 'set backpack LED [INDEX] to [PRESET]', {
                        INDEX: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_INDEX', defaultValue: '2' },
                        PRESET: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_PRESET', defaultValue: 'blue' }
                    }),
                    makeBlock('set_backpack_light_pattern', 'set backpack LED [INDEX] pattern [PATTERN] R [R] G [G] B [B] on_ms [ON] off_ms [OFF] trans_on [TON] trans_off [TOFF]', {
                        INDEX: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_INDEX', defaultValue: '3' },
                        PATTERN: { type: Scratch.ArgumentType.STRING, menu: 'LIGHT_PATTERNS', defaultValue: 'steady' },
                        R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 255 },
                        G: { type: Scratch.ArgumentType.NUMBER, defaultValue: 255 },
                        B: { type: Scratch.ArgumentType.NUMBER, defaultValue: 255 },
                        ON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        OFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        TON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        TOFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                    }),
                    makeBlock('set_head_light', 'set IR camera light [ENABLE]', {
                        ENABLE: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' }
                    }),

                    makeBlock('set_cube_lights_preset', 'set cube [CUBE_ID] lights to [PRESET]', {
                        CUBE_ID: { type: Scratch.ArgumentType.STRING, menu: 'CUBE_IDS', defaultValue: '1' },
                        PRESET: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_PRESET', defaultValue: 'red' }
                    }),

                    makeAsyncBlock('play_anim_trigger', 'play animation [NAME] parallel [IN_PARALLEL] await [AWAIT]', {
                        NAME: { type: Scratch.ArgumentType.STRING, menu: 'ANIMATIONS', defaultValue: 'MajorWin' }
                    }),
                    makeAsyncBlock('say_text', 'say [TEXT] voice [USE_COZMO_VOICE] duration [DURATION_SCALAR] pitch [VOICE_PITCH] parallel [IN_PARALLEL] await [AWAIT]', {
                        TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'HELLO' },
                        USE_COZMO_VOICE: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' },
                        DURATION_SCALAR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1.0 },
                        VOICE_PITCH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.0 }
                    }),
                    makeBlock('play_song', 'play note [NOTE] duration [DURATION] await [WAIT]', {
                        NOTE: { type: Scratch.ArgumentType.STRING, menu: 'NOTE_TYPES', defaultValue: 'C3' },
                        DURATION: { type: Scratch.ArgumentType.STRING, menu: 'NOTE_DURATIONS', defaultValue: 'Quarter' },
                        WAIT: { type: Scratch.ArgumentType.STRING, menu: 'BOOL', defaultValue: 'True' }
                    }),
                    makeBlock('set_cube_lights', 'set cube [CUBE_ID] corner [LIGHT_CORNER] lights to [PRESET]', {
                        CUBE_ID: { type: Scratch.ArgumentType.STRING, menu: 'CUBE_IDS', defaultValue: '1' },
                        LIGHT_CORNER: { type: Scratch.ArgumentType.STRING, menu: 'LIGHT_CORNERS', defaultValue: 'all' },
                        PRESET: { type: Scratch.ArgumentType.STRING, menu: 'BACKPACK_PRESET', defaultValue: 'red' }
                    }),
                    makeBlock('set_cube_light_corners_pattern', 'set cube [CUBE_ID] corner [LIGHT_CORNER] pattern [PATTERN] R [R] G [G] B [B] on_ms [ON] off_ms [OFF] trans_on [TON] trans_off [TOFF]', {
                        CUBE_ID: { type: Scratch.ArgumentType.STRING, menu: 'CUBE_IDS', defaultValue: '2' },
                        LIGHT_CORNER: { type: Scratch.ArgumentType.STRING, menu: 'LIGHT_CORNERS', defaultValue: 'light1' },
                        PATTERN: { type: Scratch.ArgumentType.STRING, menu: 'LIGHT_PATTERNS', defaultValue: 'flash' },
                        R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        G: { type: Scratch.ArgumentType.NUMBER, defaultValue: 255 },
                        B: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        ON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 500 },
                        OFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                        TON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 250 },
                        TOFF: { type: Scratch.ArgumentType.NUMBER, defaultValue: 750 }
                    }),
                    makeSensorBlock('reporter', 'battery_voltage', 'battery voltage'),
                    makeSensorBlock('reporter', 'battery_percent', 'battery percent'),
                    makeSensorBlock('boolean', 'is_charging', 'is charging?'),
                    makeSensorBlock('boolean', 'is_picked_up', 'is picked up?'),
                    makeSensorBlock('boolean', 'is_moving', 'is moving?'),
                    makeSensorBlock('boolean', 'is_carrying_block', 'is carrying block?'),
                    makeSensorBlock('boolean', 'is_cliff_detected', 'is cliff detected?'),                   
                    makeSensorBlock('boolean', 'cube_1_connected', 'cube 1 connected?'),
                    makeSensorBlock('boolean', 'cube_2_connected', 'cube 2 connected?'),
                    makeSensorBlock('boolean', 'cube_3_connected', 'cube 3 connected?'),
                    makeSensorBlock('boolean', 'cube_1_visible', 'cube 1 visible?'),
                    makeSensorBlock('boolean', 'cube_2_visible', 'cube 2 visible?'),
                    makeSensorBlock('boolean', 'cube_3_visible', 'cube 3 visible?'),
                    makeSensorBlock('boolean', 'cube_tapped_id', 'cube tapped id'),
                ],
                menus: {
                    BACKPACK_PRESET: ['off', 'red', 'green', 'blue', 'white', 'red_light', 'green_light', 'blue_light', 'white_light', 'off_light'],
                    BACKPACK_INDEX: ['1', '2', '3', '4', '5'],
                    LIGHT_PATTERNS: ['steady', 'flash', 'off'],
                    BOOL: ['True', 'False'],
                    ANIMATIONS: ['MajorWin'],
                    NOTE_TYPES: ['C2', 'C2_Sharp', 'D2', 'D2_Sharp', 'E2', 'F2', 'F2_Sharp', 'G2', 'G2_Sharp', 'A2', 'A2_Sharp', 'B2', 'C3', 'C3_Sharp', 'Rest'],
                    NOTE_DURATIONS: ['Whole', 'ThreeQuarter', 'Half', 'Quarter'],
                    CUBE_IDS: ['1', '2', '3'],
                    LIGHT_CORNERS: ['all', 'light1', 'light2', 'light3', 'light4']
                }
            };
        }

        set_verbose_logging(args) {
            const on = (typeof args === 'string') ? (args.toLowerCase() === 'true') : !!args;
            this._verbose = !!on;
            try { if (typeof localStorage !== 'undefined') localStorage.setItem('Cozmo_verbose', this._verbose ? '1' : '0'); } catch (e) {}
        }

        _connect() {
            if (this.connecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
            this.connecting = true;
            try {
                this.ws = new WebSocket(this.url);
                this.ws.binaryType = 'arraybuffer';
            } catch (e) {
                console.warn('Cozmo: websocket create failed', e);
                setTimeout(() => { this.connecting = false; this._connect(); }, 2000);
                return;
            }

            this.ws.onopen = () => {
                console.log('Cozmo: connected to', this.url);
                this.connecting = false;
                try {
                    if (!document.getElementById('cozmo-camera-overlay')) {
                        const img = document.createElement('img');
                        img.id = 'cozmo-camera-overlay';
                        img.style.position = 'fixed';
                        img.style.width = '320px';
                        img.style.height = '240px';
                        img.style.zIndex = 9999;
                        img.style.background = 'black';
                        img.style.border = '2px solid rgba(0,0,0,0.6)';
                        img.style.display = 'none';
                        img.style.cursor = 'move';
                        try {
                            const pos = JSON.parse(localStorage.getItem('cozmo_camera_pos') || 'null');
                            if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
                                img.style.left = pos.left + 'px';
                                img.style.top = pos.top + 'px';
                            } else {
                                img.style.right = '10px';
                                img.style.bottom = '10px';
                            }
                        } catch (e) {
                            img.style.right = '10px';
                            img.style.bottom = '10px';
                        }

                        try {
                            let dragging = false;
                            let dragOffsetX = 0;
                            let dragOffsetY = 0;

                            img.addEventListener('pointerdown', (ev) => {
                                try { img.setPointerCapture(ev.pointerId); } catch (e) {}
                                dragging = true;
                                const rect = img.getBoundingClientRect();
                                dragOffsetX = ev.clientX - rect.left;
                                dragOffsetY = ev.clientY - rect.top;
                                ev.preventDefault();
                            });

                            document.addEventListener('pointermove', (ev) => {
                                if (!dragging) return;
                                const w = img.offsetWidth || parseInt(img.style.width, 10) || 320;
                                const h = img.offsetHeight || parseInt(img.style.height, 10) || 240;
                                let left = ev.clientX - dragOffsetX;
                                let top = ev.clientY - dragOffsetY;
                                left = Math.max(0, Math.min(window.innerWidth - w, left));
                                top = Math.max(0, Math.min(window.innerHeight - h, top));
                                try { img.style.right = 'auto'; img.style.bottom = 'auto'; } catch (e) {}
                                img.style.left = left + 'px';
                                img.style.top = top + 'px';
                                ev.preventDefault();
                            });

                            document.addEventListener('pointerup', (ev) => {
                                if (!dragging) return;
                                try { img.releasePointerCapture && img.releasePointerCapture(ev.pointerId); } catch (e) {}
                                dragging = false;
                                try {
                                    const l = parseInt(img.style.left, 10) || 0;
                                    const t = parseInt(img.style.top, 10) || 0;
                                    localStorage.setItem('cozmo_camera_pos', JSON.stringify({left: l, top: t}));
                                } catch (e) {}
                            });
                        } catch (e) {
                        }

                        document.body.appendChild(img);
                    }
                } catch (e) {  }
            };
        this.ws.onmessage = (ev) => {
                try {
                    if (typeof ev.data === 'string') {
                        const data = JSON.parse(ev.data);
                    if (data && data.state) {
                        try { this._lastState = data.state; this._lastStateTs = Date.now(); } catch (e) {  }
                        try {
                            const waiters = this._stateWaiters.slice();
                            this._stateWaiters = [];
                            waiters.forEach(cb => {
                                try { cb(data.state); } catch (e) {  }
                            });
                        } catch (e) {
                        }
                    }
                    else if (data && data.event === 'call_result') {
                        try {
                            const d = data.data || {};
                            const callId = d && (d.call_id || d.callId || d.id);
                            if (callId && this._callResolvers.has(String(callId))) {
                                const cb = this._callResolvers.get(String(callId));
                                this._callResolvers.delete(String(callId));
                                try { cb(d); } catch (e) {  }
                            }
                        } catch (e) {  }
                    }
                    } else if (ev.data instanceof ArrayBuffer) {
                        const bytes = new Uint8Array(ev.data);
                        const newlineIndex = bytes.indexOf(10); 
                        if (newlineIndex > 0) {
                            const jsonBytes = bytes.slice(0, newlineIndex);
                            const jsonStr = new TextDecoder().decode(jsonBytes);
                            const data = JSON.parse(jsonStr);
                            const jpegBytes = bytes.slice(newlineIndex + 1);
                            if (data && data.event === 'camera_frame') {
                                try {
                                    const img = document.getElementById('cozmo-camera-overlay');
                                    if (img) {
                                        const blob = new Blob([jpegBytes], {type: 'image/jpeg'});
                                        img.src = URL.createObjectURL(blob);
                                        img.style.display = 'block';
                                    }
                                } catch (e) {  }
                            }
                        }
                    }
                } catch (e) {
                    if (this._verbose) console.log('Cozmo: message', ev.data);
                }
            };
            this.ws.onclose = (ev) => {
                console.log('Cozmo: websocket closed', ev && ev.code);
                this.ws = null;
                this.connecting = false;
                setTimeout(() => this._connect(), 2000);
            };
            this.ws.onerror = (err) => {
                console.warn('Cozmo: websocket error', err);
            };
        }

        _send(payload) {
            const text = JSON.stringify(payload);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(text);
                return true;
            }
            console.warn('Cozmo: websocket not connected, trying to connect');
            this._connect();
            return false;
        }

        _sendWithRetry(payload, delayMs = 500) {
            const ok = this._send(payload);
            if (!ok) {
                setTimeout(() => this._send(payload), delayMs);
            }
            return ok;
        }

        _attachCallId(payloadKwargs) {
            const id = crypto.randomUUID();
            try { payloadKwargs.__call_id = id; } catch (e) {  }
            return id;
        }

        _awaitCallResult(callId, timeoutMs = 15000) {
            if (!callId) return Promise.resolve(false);
            return new Promise((resolve) => {
                let done = false;
                const cb = (data) => { if (done) return; done = true; resolve(data || true); };
                this._callResolvers.set(String(callId), cb);
                setTimeout(() => { if (!done) { done = true; this._callResolvers.delete(String(callId)); resolve(false); } }, timeoutMs);
            });
        }

        _requestState(timeoutMs = 500) {
            if (this._lastState) {
                return Promise.resolve(this._lastState);
            }
            return new Promise((resolve) => {
                let done = false;
                const cb = (state) => {
                    if (done) return;
                    done = true;
                    resolve(state);
                };
                this._stateWaiters.push(cb);
                this._send({cmd: 'get_state', args: []});
                setTimeout(() => {
                    if (!done) {
                        done = true;
                        resolve({
                            pose: {x:0,y:0,angle:0},
                            head: 0,
                            lift: 0,
                            battery: 0,
                            cube_visible: false,
                            faces: []
                        });
                    }
                }, timeoutMs);
            });
        }

        _parseAsyncArgs(args) {
            const inParallel = (typeof args.IN_PARALLEL === 'string') ? (args.IN_PARALLEL.toLowerCase() === 'true') : !!args.IN_PARALLEL;
            const shouldAwait = (typeof args.AWAIT === 'string') ? (args.AWAIT.toLowerCase() === 'true') : !!args.AWAIT;
            return { inParallel, shouldAwait };
        }

        _parseBool(arg, defaultValue = false) {
            return (typeof arg === 'string') ? (arg.toLowerCase() === 'true') : !!arg;
        }

        _parseNumber(arg, defaultValue = 0, min = -Infinity, max = Infinity) {
            const num = Number(arg);
            return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : defaultValue;
        }

        _convertColorToLight(color) {
            const colorMap = {
                off: [0,0,0],
                red: [255,0,0],
                green: [0,255,0],
                blue: [0,0,255],
                white: [255,255,255],
                red_light: [64,0,0],
                green_light: [0,64,0],
                blue_light: [0,0,64],
                white_light: [64,64,64],
                off_light: [0,0,0]
            };
            const rgb = colorMap[color] || [0,0,255]; 
            return { __cozmo_type: 'light', value: rgb };
        }

        _sendCommand(methodName, posArgs, shouldAwait, timeoutMs = 10000) {
            const payloadKwargs = {};
            const myCallId = this._attachCallId(payloadKwargs);
            const payload = { cmd: 'call', args: [methodName, posArgs, payloadKwargs, shouldAwait] };
            this._sendWithRetry(payload, 500);
            if (shouldAwait) {
                return this._awaitCallResult(myCallId, timeoutMs);
            } else {
                return Promise.resolve(true);
            }
        }

        say_text(args) {
            const text = args.TEXT || 'HELLO';
            const useCozmoVoice = this._parseBool(args.USE_COZMO_VOICE, false);
            let durationScalar = this._parseNumber(args.DURATION_SCALAR, 1.0);
            if (durationScalar <= 0) durationScalar = 1.0;
            let voicePitch = this._parseNumber(args.VOICE_PITCH, 0.0);
            if (voicePitch < -1.0) voicePitch = -1.0;
            if (voicePitch > 1.0) voicePitch = 1.0;
            const inParallel = this._parseBool(args.IN_PARALLEL, false);
            const shouldAwait = this._parseBool(args.AWAIT, true);
            const playExcited = false;
            const posArgs = [text, playExcited, useCozmoVoice, durationScalar, voicePitch, inParallel];
            return this._sendCommand('robot.say_text', posArgs, shouldAwait, 10000);
        }

        drive_straight(args) {
            const distance = this._parseNumber(args.DISTANCE, 0);
            const speed = this._parseNumber(args.SPEED, 50); 
            const { inParallel, shouldAwait } = this._parseAsyncArgs(args);
            const playAnim = this._parseBool(args.PLAY_ANIM, true);

            const distWrapper = { __cozmo_type: 'distance_mm', value: distance };
            const speedWrapper = { __cozmo_type: 'speed_mmps', value: speed };

            const posArgs = [distWrapper, speedWrapper, playAnim, inParallel];
            return this._sendCommand('robot.drive_straight', posArgs, shouldAwait, 15000);
        }

        drive_wheels(args) {
            const left = this._parseNumber(args.LEFT, 0);
            const right = this._parseNumber(args.RIGHT, 0);
            const duration = this._parseNumber(args.DURATION, 0);
            const shouldAwait = this._parseBool(args.WAIT, true);

            const posArgs = [left, right, null, null, (duration > 0 ? duration : null)];
            const timeoutMs = Math.max(10000, duration * 1000 + 2000);
            return this._sendCommand('robot.drive_wheels', posArgs, shouldAwait, timeoutMs);
        }

        stop_all_motors(args) {
            return this._sendCommand('robot.stop_all_motors', [], false);
        }

        abort_all_actions(args) {
            return this._sendCommand('robot.abort_all_actions', [], false);
        }

        play_song(args) {
            const note = (args.NOTE || '').toString().trim();
            const dur = (args.DURATION || '').toString().trim();
            const shouldAwait = (typeof args.WAIT === 'string') ? (args.WAIT.toLowerCase() === 'true') : !!args.WAIT;
            if (!note || !dur) return;
            const sn = { __cozmo_type: 'songnote', value: { noteType: note, noteDuration: dur } };
            const argsList = [[ sn ]]; 
            return this._sendCommand('robot.play_song', argsList, shouldAwait, 10000);
        }
        set_backpack_preset(args) {
            const preset = (args.PRESET || '').trim();
            if (!preset) return;
            const presetMap = {
                off: [0,0,0], red: [255,0,0], green: [0,255,0], blue: [0,0,255], white: [255,255,255],
                red_light: [64,0,0], green_light: [0,64,0], blue_light: [0,0,64], white_light: [64,64,64], off_light: [0,0,0]
            };
            const rgb = presetMap[preset] || [0,0,0];
            this._backpack = [rgb, rgb, rgb, rgb, rgb];
            const lightWrapper = { __cozmo_type: 'light', value: rgb };
            return this._sendCommand('robot.set_all_backpack_lights', [lightWrapper], false);
        }

        set_backpack_led(args) {
            let idx = Math.floor(this._parseNumber(args.INDEX, 1));
            if (idx < 1) idx = 1;
            if (idx > 5) idx = 5;
            const preset = (args.PRESET || '').trim();
            if (!preset) return;
            this._backpack[idx-1] = preset;
            const presetMap = {
                off: [0,0,0], red: [255,0,0], green: [0,255,0], blue: [0,0,255], white: [255,255,255],
                red_light: [64,0,0], green_light: [0,64,0], blue_light: [0,0,64], white_light: [64,64,64], off_light: [0,0,0]
            };
            const makeWrapper = (v) => {
                if (v && typeof v === 'object' && Array.isArray(v.on)) return { __cozmo_type: 'light', value: v };
                if (Array.isArray(v) && v.length >= 3) return { __cozmo_type: 'light', value: [v[0], v[1], v[2]] };
                if (typeof v === 'string') return { __cozmo_type: 'light', value: (presetMap[v] || [0,0,0]) };
                return { __cozmo_type: 'light', value: [0,0,0] };
            };
            return this._sendCommand('robot.set_backpack_lights', [
                makeWrapper(this._backpack[0]), makeWrapper(this._backpack[1]), makeWrapper(this._backpack[2]), makeWrapper(this._backpack[3]), makeWrapper(this._backpack[4])
            ], false);
        }

        set_backpack_light_pattern(args) {
            let idx = Math.floor(this._parseNumber(args.INDEX, 1));
            if (idx < 1) idx = 1;
            if (idx > 5) idx = 5;
            const pattern = (args.PATTERN || 'steady').trim();
            const r = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.R, 0))));
            const g = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.G, 0))));
            const b = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.B, 0))));
            const on_ms = Math.max(0, Math.floor(this._parseNumber(args.ON, 0)));
            const off_ms = Math.max(0, Math.floor(this._parseNumber(args.OFF, 0)));
            const t_on = Math.max(0, Math.floor(this._parseNumber(args.TON, 0)));
            const t_off = Math.max(0, Math.floor(this._parseNumber(args.TOFF, 0)));

            const lightObj = {on: [r,g,b], off: [r,g,b], on_period_ms: on_ms, off_period_ms: off_ms, transition_on_period_ms: t_on, transition_off_period_ms: t_off, pattern: pattern};
            this._backpack[idx-1] = lightObj;
            const makeWrapper = (v) => {
                if (v && typeof v === 'object' && Array.isArray(v.on)) return { __cozmo_type: 'light', value: v };
                if (Array.isArray(v) && v.length >= 3) return { __cozmo_type: 'light', value: [v[0], v[1], v[2]] };
                return { __cozmo_type: 'light', value: [0,0,0] };
            };
            const argsList = [makeWrapper(this._backpack[0]), makeWrapper(this._backpack[1]), makeWrapper(this._backpack[2]), makeWrapper(this._backpack[3]), makeWrapper(this._backpack[4])];
            return this._sendCommand('robot.set_backpack_lights', argsList, false);
        }

        set_backpack_preset_pattern(args) {
            const pattern = (args.PATTERN || 'steady').trim();
            const r = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.R, 0))));
            const g = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.G, 0))));
            const b = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.B, 0))));
            const on_ms = Math.max(0, Math.floor(this._parseNumber(args.ON, 0)));
            const off_ms = Math.max(0, Math.floor(this._parseNumber(args.OFF, 0)));
            const t_on = Math.max(0, Math.floor(this._parseNumber(args.TON, 0)));
            const t_off = Math.max(0, Math.floor(this._parseNumber(args.TOFF, 0)));

            const lightObj = {on: [r,g,b], off: [r,g,b], on_period_ms: on_ms, off_period_ms: off_ms, transition_on_period_ms: t_on, transition_off_period_ms: t_off, pattern: pattern};
            this._backpack = [lightObj, lightObj, lightObj, lightObj, lightObj];
            const makeWrapper = (v) => ({ __cozmo_type: 'light', value: (v && typeof v === 'object' && Array.isArray(v.on)) ? v : [0,0,0] });
            return this._sendCommand('robot.set_backpack_lights', [makeWrapper(lightObj), makeWrapper(lightObj), makeWrapper(lightObj), makeWrapper(lightObj), makeWrapper(lightObj)], false);
        }

        set_head_light(args) {
            const enable = this._parseBool(args.ENABLE, false);
            return this._sendCommand('robot.set_head_light', [enable], false);
        }

        set_cube_lights(args) {
            const cubeId = args.CUBE_ID;
            const lightCorner = args.LIGHT_CORNER;
            const preset = args.PRESET;
            const lightWrapper = this._convertColorToLight(preset);
            const offWrapper = { __cozmo_type: 'light', value: [0, 0, 0] };
            let methodName, posArgs;
            if (lightCorner === 'all') {
                methodName = 'robot.world.light_cubes[' + cubeId + '].set_lights';
                posArgs = [lightWrapper];
            } else {
                methodName = 'robot.world.light_cubes[' + cubeId + '].set_light_corners';
                const lights = [offWrapper, offWrapper, offWrapper, offWrapper];
                const index = { 'light1': 0, 'light2': 1, 'light3': 2, 'light4': 3 }[lightCorner];
                lights[index] = lightWrapper;
                posArgs = lights;
            }
            return this._sendCommand(methodName, posArgs, false);
        }

        set_cube_lights_preset(args) {
            const cubeId = args.CUBE_ID;
            const preset = args.PRESET;
            const lightWrapper = this._convertColorToLight(preset);
            const methodName = 'robot.world.light_cubes[' + cubeId + '].set_lights';
            return this._sendCommand(methodName, [lightWrapper], false);
        }

        set_cube_light_corners_pattern(args) {
            const cubeId = args.CUBE_ID;
            const lightCorner = args.LIGHT_CORNER;
            const pattern = (args.PATTERN || 'steady').trim();
            const r = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.R, 0))));
            const g = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.G, 0))));
            const b = Math.max(0, Math.min(255, Math.floor(this._parseNumber(args.B, 0))));
            const on_ms = Math.max(0, Math.floor(this._parseNumber(args.ON, 0)));
            const off_ms = Math.max(0, Math.floor(this._parseNumber(args.OFF, 0)));
            const t_on = Math.max(0, Math.floor(this._parseNumber(args.TON, 0)));
            const t_off = Math.max(0, Math.floor(this._parseNumber(args.TOFF, 0)));

            const lightObj = {on: [r,g,b], off: [r,g,b], on_period_ms: on_ms, off_period_ms: off_ms, transition_on_period_ms: t_on, transition_off_period_ms: t_off, pattern: pattern};
            const lightWrapper = { __cozmo_type: 'light', value: lightObj };
            const offWrapper = { __cozmo_type: 'light', value: [0, 0, 0] };
            let methodName, posArgs;
            if (lightCorner === 'all') {
                methodName = 'robot.world.light_cubes[' + cubeId + '].set_lights';
                posArgs = [lightWrapper];
            } else {
                methodName = 'robot.world.light_cubes[' + cubeId + '].set_light_corners';
                const lights = [offWrapper, offWrapper, offWrapper, offWrapper];
                const index = { 'light1': 0, 'light2': 1, 'light3': 2, 'light4': 3 }[lightCorner];
                lights[index] = lightWrapper;
                posArgs = lights;
            }
            return this._sendCommand(methodName, posArgs, false);
        }

        turn_in_place(args) {
            const angle = this._parseNumber(args.ANGLE, 0);
            const speed = this._parseNumber(args.SPEED, 90);
            const { inParallel, shouldAwait } = this._parseAsyncArgs(args);

            const angleWrapper = { __cozmo_type: 'degrees', value: angle };
            const posArgs = [angleWrapper, speed, inParallel];
            return this._sendCommand('robot.turn_in_place', posArgs, shouldAwait, 15000);
        }
        set_head_angle(args) {
            let p = this._parseNumber(args.PERCENT, 0);
            p = Math.max(0, Math.min(100, p));
            const MIN = -25.0;
            const MAX = 44.5;
            const angle = MIN + (p / 100.0) * (MAX - MIN);
            const duration = this._parseNumber(args.DURATION, 0);
            const { inParallel, shouldAwait } = this._parseAsyncArgs(args);
            const angleWrapper = { __cozmo_type: 'degrees', value: angle };
            const posArgs = [angleWrapper, duration, inParallel];
            return this._sendCommand('robot.set_head_angle', posArgs, shouldAwait, 10000);
        }

        set_lift_height(args) {
            let percent = this._parseNumber(args.HEIGHT, 20);
            percent = Math.max(0, Math.min(100, percent));
            const h = percent / 100.0;
            const duration = this._parseNumber(args.DURATION, 0);
            const { inParallel, shouldAwait } = this._parseAsyncArgs(args);
            const posArgs = [h, duration, inParallel];
            return this._sendCommand('robot.set_lift_height', posArgs, shouldAwait, 10000);
        }
        play_anim_trigger(args) {
            const name = (args.NAME || '').toString().trim();
            const { inParallel, shouldAwait } = this._parseAsyncArgs(args);
            const loop_count = 1;
            const num_retries = 0;
            const animWrapper = { __cozmo_type: 'anim', value: name };
            const posArgs = [animWrapper, loop_count, inParallel, num_retries];
            return this._sendCommand('robot.play_anim_trigger', posArgs, shouldAwait, 10000);
        }


        async battery_voltage() {
            const s = await this._requestState();
            return s.battery_voltage;
        }

        async is_picked_up() {
            const s = await this._requestState();
            return !!s.is_picked_up;
        }

        async is_charging() {
            const s = await this._requestState();
            return !!s.is_charging;
        }
        async camera_enabled() {
            const s = await this._requestState();
            return !!s.camera_enabled;
        }

        async is_cliff_detected() {
            const s = await this._requestState();
            return !!s.is_cliff_detected;
        }

        async is_moving() {
            const s = await this._requestState();
            return !!s.is_moving;
        }

        async is_carrying_block() {
            const s = await this._requestState();
            return !!s.is_carrying_block;
        }

        async battery_percent() { const s = await this._requestState(); return s.battery_percent || 0; }

        async cube_1_connected() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_1_connected state:', s);
            return !!s.cube_1_connected;
        }

        async cube_2_connected() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_2_connected state:', s);
            return !!s.cube_2_connected;
        }

        async cube_3_connected() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_3_connected state:', s);
            return !!s.cube_3_connected;
        }

        async cube_1_visible() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_1_visible state:', s);
            return !!s.cube_1_visible;
        }

        async cube_2_visible() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_2_visible state:', s);
            return !!s.cube_2_visible;
        }

        async cube_3_visible() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_3_visible state:', s);
            return !!s.cube_3_visible;
        }

        async cube_tapped_id() {
            const s = await this._requestState();
            if (this._verbose) console.log('Cozmo: cube_tapped_id state:', s);
            return s.cube_tapped_id || 0;
        }

    }

    if (typeof Scratch !== 'undefined') {
        const _cozmoExtInstance = new Cozmo();
        try {
            const info = (_cozmoExtInstance.getInfo && _cozmoExtInstance.getInfo()) || {};
            const blocks = info.blocks || [];
            blocks.forEach(b => {
                const op = b && b.opcode;
                if (op && typeof _cozmoExtInstance[op] !== 'function') {
                    console.warn('Cozmo: opcode "' + op + '" is not a function, installing stub to avoid VM crash');
                    _cozmoExtInstance[op] = function(args) { console.warn('Cozmo: stub called for opcode "' + op + '"', args); };
                }
            });
        } catch (e) {
            console.warn('Cozmo: sanity-check failed', e);
        }
        Scratch.extensions.register(_cozmoExtInstance);
    } else {
        window.CozmoExtension = Cozmo;
    }

})(Scratch);
