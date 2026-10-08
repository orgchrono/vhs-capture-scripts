import threading
import time
import json

# Global stats
obs_health_stats = {
    "dropped_frames": 0,
    "cpu_usage": 0.0,
    "is_recording": False
}

def obs_health_monitor():
    import websocket
    while True:
        try:
            ws = websocket.create_connection("ws://127.0.0.1:4455", timeout=2)
            
            # Identify
            identify = {
                "op": 1,
                "d": {"rpcVersion": 1, "eventSubscriptions": 0}
            }
            ws.send(json.dumps(identify))
            ws.recv() # Hello
            ws.recv() # Identified
            
            while True:
                # GetStats
                req_stats = {
                    "op": 6,
                    "d": {"requestType": "GetStats", "requestId": "stats"}
                }
                ws.send(json.dumps(req_stats))
                res_stats = json.loads(ws.recv())
                if "d" in res_stats and "responseData" in res_stats["d"]:
                    data = res_stats["d"]["responseData"]
                    obs_health_stats["cpu_usage"] = data.get("cpuUsage", 0)
                    obs_health_stats["dropped_frames"] = data.get("outputSkippedFrames", 0) + data.get("renderSkippedFrames", 0)
                
                # GetRecordStatus
                req_rec = {
                    "op": 6,
                    "d": {"requestType": "GetRecordStatus", "requestId": "rec"}
                }
                ws.send(json.dumps(req_rec))
                res_rec = json.loads(ws.recv())
                if "d" in res_rec and "responseData" in res_rec["d"]:
                    obs_health_stats["is_recording"] = res_rec["d"]["responseData"].get("outputActive", False)
                
                time.sleep(2)
        except Exception as e:
            time.sleep(5) # Reconnect loop

# Start monitor thread
t = threading.Thread(target=obs_health_monitor, daemon=True)
t.start()