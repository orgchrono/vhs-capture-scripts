import pytest
from unittest.mock import patch, MagicMock
from vhs_studio.api.obs_client import OBSClient

def test_obs_client_init():
    client = OBSClient(host="localhost", port=1234, password="test")
    assert client.host == "localhost"
    assert client.port == 1234
    assert client.password == "test"
    assert client.is_connected is False

@patch("websocket.create_connection")
def test_obs_client_connect_success(mock_ws):
    # Mocking WS responses for auth flow
    mock_conn = MagicMock()
    mock_ws.return_value = mock_conn
    mock_conn.recv.side_effect = [
        '{"d": {"authentication": {"salt": "s", "challenge": "c"}}}',
        '{"op": 2}'  # Identified success
    ]
    
    client = OBSClient(password="pwd")
    assert client.connect() is True
    assert client.is_connected is True

@patch("websocket.create_connection")
def test_obs_client_auto_reconnect(mock_ws):
    mock_conn = MagicMock()
    mock_ws.return_value = mock_conn
    
    # First attempt fails (raises Exception), second attempt succeeds
    mock_conn.recv.side_effect = [
        Exception("Connection reset"),
        '{"d": {}}',  # No auth
        '{"op": 2}'   # Success
    ]
    
    client = OBSClient()
    client._backoff = 0.01  # speed up test
    
    assert client.connect() is True
    assert client.is_connected is True
