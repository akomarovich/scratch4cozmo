import asyncio
import json
import websockets
import time
import io
import re
from PIL import Image, ImageDraw
from typing import Any, Dict, List, Optional

import cozmo
from cozmo.annotate import ImageText, TOP_RIGHT
from cozmo.objects import EvtObjectTapped

import logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger('cozmo_server')

HOST = '127.0.0.1'
PORT = 26966
PUSH_HZ = 5
CAMERA_PUSH_HZ = 30
CMD_GET_STATE = 'get_state'
CMD_CALL = 'call'

global_context = type('Context', (), {})()
cube: Optional[Any] = None
_clients: List[websockets.WebSocketServerProtocol] = []
_latest_camera_image: Optional[Image.Image] = None
_ws_locks = {}
light_corners_cache = {}

def _convert_typed_value(val: Any) -> Any:
    if isinstance(val, (list, tuple)):
        return [_convert_typed_value(x) for x in val]

    if not isinstance(val, dict):
        return val

    
    ctype = val.get('__cozmo_type')
    if not ctype:
        return val

    
    raw_v = val.get('value')
    if isinstance(raw_v, (list, tuple)):
        args = [_convert_typed_value(x) for x in raw_v]
    else:
        args = [_convert_typed_value(raw_v)]

    
    try:
        if ctype == 'distance_mm':
            return cozmo.util.distance_mm(float(args[0]))

        if ctype == 'speed_mmps':
            return cozmo.util.speed_mmps(float(args[0]))

        if ctype in ('degrees', 'degree', 'angle'):
            return cozmo.util.degrees(float(args[0]))

        if ctype == 'songnote':
            noteType = vars(cozmo.song.NoteTypes).get(args[0]['noteType'])
            noteDuration = vars(cozmo.song.NoteDurations).get(args[0]['noteDuration'])
            return cozmo.song.SongNote(noteType, noteDuration)

        if ctype == 'anim':
            return vars(cozmo.anim.Triggers).get(args[0])

        if ctype == 'light':
            raw = raw_v if isinstance(raw_v, (dict, list, tuple)) else (args[0] if args else None)

            if isinstance(raw, dict):
                on_rgb = raw.get('on') or raw.get('on_color') or raw.get('on_rgb') or raw.get('value')
                off_rgb = raw.get('off') or raw.get('off_color') or raw.get('off_rgb') or on_rgb
                on_period = int(raw.get('on_period_ms') or raw.get('on_ms') or 0)
                off_period = int(raw.get('off_period_ms') or raw.get('off_ms') or 0)
                t_on = int(raw.get('transition_on_period_ms') or raw.get('transition_on_ms') or 0)
                t_off = int(raw.get('transition_off_period_ms') or raw.get('transition_off_ms') or 0)

                def _to_rgb_tuple(x):
                    if isinstance(x, (list, tuple)) and len(x) >= 3:
                        return (int(x[0]) & 0xFF, int(x[1]) & 0xFF, int(x[2]) & 0xFF)
                    return None

                on_t = _to_rgb_tuple(on_rgb)
                off_t = _to_rgb_tuple(off_rgb) or on_t

                Color = getattr(cozmo.lights, 'Color', None)
                Light = getattr(cozmo.lights, 'Light', None)
                if Color and Light:
                    on_color = Color(rgb=on_t)
                    off_color = Color(rgb=off_t) if off_t is not None else on_color
                    base_light = Light(on_color=on_color, off_color=off_color,
                                     on_period_ms=on_period, off_period_ms=off_period,
                                     transition_on_period_ms=t_on, transition_off_period_ms=t_off)

                    
                    pattern = (raw.get('pattern') or '').lower() if isinstance(raw, dict) else ''
                    if pattern == 'flash':
                        
                        try:
                            return base_light.flash(on_period_ms=on_period, off_period_ms=off_period)
                        except Exception:
                            return base_light
                    elif pattern == 'off':
                        
                        try:
                            return getattr(cozmo.lights, 'off_light')
                        except Exception:
                            return base_light
                    else:
                        
                        return base_light

            elif isinstance(raw, (list, tuple)):
                r, g, b = int(raw[0]) & 0xFF, int(raw[1]) & 0xFF, int(raw[2]) & 0xFF
                Color = getattr(cozmo.lights, 'Color', None)
                Light = getattr(cozmo.lights, 'Light', None)
                if Color:
                    c = Color(rgb=(r, g, b))
                    return Light(on_color=c, off_color=c) if Light else c

        return val  
    except Exception:
        return val  


def _coerce_call_args(func, args: List[Any], kwargs: Dict[str, Any]):   
    new_args = [_convert_typed_value(a) for a in list(args or [])]
    new_kwargs = {k: _convert_typed_value(v) for k, v in dict(kwargs or {}).items()}

    return new_args, new_kwargs





async def _broadcast(obj: Dict[str, Any]) -> None:
    
    
    
    payload = json.dumps(obj, default=str)
    if not _clients:
        return
    coros = [_safe_ws_send(ws, payload) for ws in list(_clients)]
    await asyncio.gather(*coros, return_exceptions=True)


async def _send_ack(ws: websockets.WebSocketServerProtocol, cmd: str) -> None:
    
    await _safe_ws_send(ws, json.dumps({"ok": True, "cmd": cmd}, default=str))


async def _send_binary_event(name: str, data: Optional[Dict[str, Any]] = None, binary_data: Optional[bytes] = None) -> None:
    if binary_data is not None:
        json_payload = json.dumps({"event": name, "data": data}, default=str)
        payload = json_payload.encode('utf-8') + b'\n' + binary_data
        if not _clients:
            return
        coros = [_safe_ws_send(ws, payload) for ws in list(_clients)]
        await asyncio.gather(*coros, return_exceptions=True)
    else:
        obj = {"event": name}
        if data is not None:
            obj["data"] = data
        await _broadcast(obj)


async def _send_event(name: str, data: Optional[Dict[str, Any]] = None) -> None:
    await _send_binary_event(name, data, None)


async def _safe_ws_send(ws: websockets.WebSocketServerProtocol, payload: Any) -> None:
    try:
        key = id(ws)
        lock = _ws_locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _ws_locks[key] = lock

        
        
        
        async with lock:
            
            if getattr(ws, 'closed', False):
                return
            
            if isinstance(payload, (bytes, bytearray)):
                await ws.send(payload)
            else:
                await ws.send(str(payload))
    except Exception as e:
        logger.debug('ws send failed: %s', e)



def battery_percent(battery_voltage: float) -> float:
    max_voltage = 4.2  
    min_voltage = 3.3  
    if battery_voltage >= max_voltage:
        return 100.0
    if battery_voltage <= min_voltage:
        return 0.0
    
    return 100.0 * (battery_voltage - min_voltage) / (max_voltage - min_voltage)

last_tap_event = None

async def _send_state(ws: Optional[websockets.WebSocketServerProtocol] = None) -> None:
    global last_tap_event
    def cube_state(cube_id: int):
        cube = robot.world.light_cubes.get(cube_id)
        return {
            "connected": cube.is_connected if cube else False,
            "visible": cube in robot.world.visible_objects if cube else False,
        }

    state = {
        "battery_voltage": robot.battery_voltage,
        "battery_percent": "charging..." if robot.is_charging else f"{round(battery_percent(robot.battery_voltage))}%",
        "is_picked_up": robot.is_picked_up,
        "is_charging": robot.is_charging,
        "is_cliff_detected": robot.is_cliff_detected,
        "is_moving": robot.is_moving,
        "is_carrying_block": robot.is_carrying_block,
        "cube_1_connected": cube_state(1)["connected"],
        "cube_1_visible": cube_state(1)["visible"],
        "cube_2_connected": cube_state(2)["connected"],
        "cube_2_visible": cube_state(2)["visible"],
        "cube_3_connected": cube_state(3)["connected"],
        "cube_3_visible": cube_state(3)["visible"],
        "cube_tapped_id": last_tap_event,
    }

    envelope = {"state": state}

    if ws:
        await _safe_ws_send(ws, json.dumps(envelope, default=str))
    else:
        await _broadcast(envelope)
    last_tap_event = None


async def _state_pusher(hz: float) -> None:
    interval = 1.0 / hz
    logger.info('Starting state pusher at %.2f Hz (interval %.3fs)', hz, interval)
    while True:
        try:
            await asyncio.sleep(interval)
            
            await _send_state()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception('state pusher error:')


async def _camera_pusher(hz: float) -> None:
    interval = 1.0 / hz
    logger.info('Starting camera pusher at %.2f Hz (interval %.3fs)', hz, interval)
    while True:
        await asyncio.sleep(interval)
        if robot is None:
            continue

        img = _latest_camera_image
        if img is None:
            continue

        
        img_rgb = img.convert('RGB')
        annotated = robot.world.image_annotator.annotate_image(img_rgb)

        
        if robot.is_charging:
            battery_text = "charging... "
        else:
            battery_level = round(battery_percent(robot.battery_voltage))
            battery_text = f"{battery_level}% "

        d = ImageDraw.Draw(annotated)
        bounds = (0, 0, annotated.width, annotated.height)
        battery_display = ImageText(battery_text, position=TOP_RIGHT, color='white', outline_color='black')
        battery_display.render(d, bounds)

        
        buf = io.BytesIO()
        annotated.save(buf, format='PNG')
        b = buf.getvalue()
        payload = {'ts': time.time(), 'w': annotated.width, 'h': annotated.height}
        await _send_binary_event('camera_frame', payload, b)


def _handle_call(args: List[Any]) -> Dict[str, Any]:
    full_path = args[0] if len(args) > 0 else ''
    call_args = args[1] if len(args) > 1 else []
    call_kwargs = args[2] if len(args) > 2 else {}
    do_await = bool(args[3]) if len(args) > 3 else False

    
    call_id = call_kwargs.pop('__call_id', None) or call_kwargs.pop('call_id', None)

    
    if full_path == 'robot.world.get_light_cube':
        cube_id = call_args[0] if call_args else None
        try:
            if hasattr(robot.world, 'light_cubes') and cube_id in robot.world.light_cubes:
                cube = robot.world.light_cubes[cube_id]
                return {"result": cube}
            else:
                
                for obj in robot.world.visible_objects:
                    if hasattr(obj, 'object_id') and obj.object_id == cube_id:
                        obj_type = obj.object_type.name if hasattr(obj.object_type, 'name') else str(obj.object_type)
                        if 'LightCube' in obj_type or 'cube' in obj_type.lower():
                            return {"result": obj}
                return {"result": None}
        except Exception as e:
            logger.warning('Error getting light cube %s: %s', cube_id, e)
            return {"result": None}

    
    if 'set_light_corners' in full_path:
        match = re.search(r'light_cubes\[(\d+)\]\.set_light_corners', full_path)
        if match:
            cube_id = int(match.group(1))
            current_cache = light_corners_cache.get(cube_id, [None] * 4)
            
            new_lights = [None] * 4
            for i in range(4):
                if i < len(call_args) and call_args[i] is not None:
                    
                    if call_args[i].get('value') == [0, 0, 0] and current_cache[i] is not None:
                        new_lights[i] = current_cache[i]
                    else:
                        new_lights[i] = call_args[i]
                else:
                    new_lights[i] = current_cache[i]
            
            parts = full_path.split('.')
            obj = global_context
            for part in parts:
                if '[' in part and ']' in part:
                    attr, index_str = part.split('[', 1)
                    index = int(index_str.rstrip(']'))
                    obj = getattr(obj, attr)[index]
                else:
                    obj = getattr(obj, part)
            func = obj
            
            new_lights_coerced = []
            for light in new_lights:
                if light is not None:
                    new_lights_coerced.append(_convert_typed_value(light))
                else:
                    new_lights_coerced.append(_convert_typed_value({'__cozmo_type': 'light', 'value': [0, 0, 0]}))
            res = func(*new_lights_coerced, **call_kwargs)
            if do_await:
                res.wait_for_completed()
            
            if res is None or (hasattr(res, 'state') and res.state != 'action_failed'):
                light_corners_cache[cube_id] = new_lights
            
            out = {"result": res}
            if hasattr(res, 'state'):
                out['state'] = res.state
            if hasattr(res, 'failure_reason') and res.failure_reason is not None:
                out['failure_reason'] = res.failure_reason
            if hasattr(res, 'failure_code') and res.failure_code is not None:
                out['failure_code'] = res.failure_code
            if call_id:
                out['call_id'] = call_id
            return out

    
    parts = full_path.split('.')
    obj = global_context
    for part in parts:
        if '[' in part and ']' in part:
            attr, index_str = part.split('[', 1)
            index = int(index_str.rstrip(']'))
            obj = getattr(obj, attr)[index]
        else:
            obj = getattr(obj, part)

    func = obj

    
    call_args, call_kwargs = _coerce_call_args(func, call_args, call_kwargs)

    
    res = func(*call_args, **call_kwargs)
    if do_await:
        res.wait_for_completed()

    
    out = {"result": res}
    if hasattr(res, 'state'):
        out['state'] = res.state
    if hasattr(res, 'failure_reason') and res.failure_reason is not None:
        out['failure_reason'] = res.failure_reason
    if hasattr(res, 'failure_code') and res.failure_code is not None:
        out['failure_code'] = res.failure_code
    if call_id:
        out['call_id'] = call_id
    return out


async def _process_message(ws: websockets.WebSocketServerProtocol, raw: str) -> None:
    data = json.loads(raw)
    cmd = data.get('cmd')
    args = data.get('args', [])

    logger.info('COMMAND to COZMO -%s from %s', args, ws.remote_address)

    if cmd == CMD_GET_STATE:
        await _send_state(ws)
        await _send_ack(ws, CMD_GET_STATE)

    elif cmd == CMD_CALL:
        try:
            result = await asyncio.get_event_loop().run_in_executor(None, _handle_call, args)
        except Exception as e:
            result = {"error": str(e)}

        if 'error' in result:
            logger.error('%s on command %s', result['error'], args)
        else:
            state = result.get('state', 'no_state')
            failure_reason = result.get('failure_reason', None)
            if state == 'action_failed':
                logger.warning('COZMO RESPONSE - state "%s" because %s on command %s', state, failure_reason, args)
            else:
                logger.info('COZMO RESPONSE - state "%s" on command %s', state, args)

        await _send_event('call_result', result)
        await _send_ack(ws, CMD_CALL)

    
    await _send_state()


async def _ws_handler(ws: websockets.WebSocketServerProtocol, path: str) -> None:
    logger.info('Client connected %s', ws.remote_address)
    _clients.append(ws)
    
    _ws_locks[id(ws)] = asyncio.Lock()
    try:
        async for msg in ws:
            await _process_message(ws, msg)
    except websockets.exceptions.ConnectionClosedOK:
        pass
    except Exception as e:
        logger.exception('ws handler error:')
    finally:
        try:
            _clients.remove(ws)
        except ValueError:
            pass
        
        try:
            _ws_locks.pop(id(ws), None)
        except Exception:
            pass
        logger.info('Client disconnected %s', ws.remote_address)


def run(sdk_conn) -> None:
    global robot, cube
    robot = sdk_conn.wait_for_robot()
    logger.info('Connected to %r', robot)

    
    global_context.robot = robot
    global_context.world = robot.world
    global_context.cozmo = cozmo
    global_context.cube = cube

    
    cam = robot.camera
    cam.image_stream_enabled = True
    cam.color_image_enabled = True
    cam.enable_auto_exposure()
    
    
    start_server = websockets.serve(_ws_handler, HOST, PORT)
    loop = asyncio.get_event_loop()
    loop.run_until_complete(start_server)

    
    if PUSH_HZ > 0:
        loop.create_task(_state_pusher(PUSH_HZ))

    if CAMERA_PUSH_HZ > 0:
        loop.create_task(_camera_pusher(CAMERA_PUSH_HZ))

    
    def _on_new_camera_image(evt, *, image=None, **kw):
        global _latest_camera_image
        img = image.raw_image if hasattr(image, 'raw_image') else image.image if hasattr(image, 'image') else image
        _latest_camera_image = img

    ev = getattr(cozmo.world, 'EvtNewCameraImage', None)
    if ev:
        robot.world.add_event_handler(ev, _on_new_camera_image)
        logger.info('Camera event handler registered')

    
    def on_object_tapped(evt, **kwargs):
        global last_tap_event
        last_tap_event = getattr(evt.obj, 'object_id', None)
        asyncio.create_task(_send_state())

    robot.add_event_handler(EvtObjectTapped, on_object_tapped)

    loop.run_forever()


if __name__ == '__main__':
    while True:
        try:
            cozmo.connect(run)
            break
        except cozmo.ConnectionError:
            time.sleep(2)