using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace CampusAR.Indoor
{
    [Serializable] public class IndoorMapDto { public string id; public string buildingId; public string name; public string status; }
    [Serializable] public class IndoorNodeDto { public string id; public string mapId; public string floorId; public float localX; public float localY; public float localZ; public string kind; public string name; }
    [Serializable] public class IndoorEdgeDto { public string id; public string fromNodeId; public string toNodeId; public float distanceM; public string kind; }
    [Serializable] public class IndoorPlaceDto { public string id; public string name; public string nodeId; public string category; }
    [Serializable] public class IndoorAnchorResolved { public IndoorNodeDto node; public IndoorMapDto map; }
    [Serializable] public class IndoorRouteStepDto { public string nodeId; public string instruction; public float distanceM; public float localX; public float localY; public float localZ; }
    [Serializable] public class IndoorRouteDto { public IndoorRouteStepDto[] nodes; public float totalDistanceM; public float estimatedTimeMinutes; public string[] instructions; }

    [Serializable] class CreateMapBody { public string buildingId; public string name; public string trackingQuality; public int planeCount; public float confidence; }
    [Serializable] class CreateNodeBody { public string mapId; public string floorId; public float localX; public float localY; public float localZ; public string kind; public string name; public float accuracyM; public string trackingQuality; public bool snap; }
    [Serializable] class CreateEdgeBody { public string mapId; public string fromNodeId; public string toNodeId; public string kind; public bool bidirectional; }
    [Serializable] class CreatePlaceBody { public string mapId; public string floorId; public string nodeId; public string name; public string category; }
    [Serializable] class CreateAnchorBody { public string mapId; public string nodeId; public string floorId; public string anchorCode; public string physicalMarkerType; }
    [Serializable] class IndoorRouteBody { public string sourceAnchorCode; public string sourceNodeId; public string destinationPlaceId; }

    /// <summary>
    /// REST client for /api/indoor. Mapping writes require an admin JWT.
    /// Indoor coordinates are local meters, not GPS.
    /// </summary>
    public class IndoorApiClient : MonoBehaviour
    {
        [SerializeField] private string apiBaseUrl = "http://localhost:4000/api";
        public string AccessToken { get; set; }

        public IEnumerator LoginAdmin(string email, string password, Action<string> onError)
        {
            var json = $"{{\"email\":\"{email}\",\"password\":\"{password}\"}}";
            using var req = Post("/auth/login", json);
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success) { onError?.Invoke(req.error); yield break; }
            AccessToken = ExtractToken(req.downloadHandler.text);
        }

        public IEnumerator CreateMap(string buildingId, string name, string trackingQuality, int planeCount, float confidence, Action<IndoorMapDto> ok, Action<string> err)
        {
            var body = JsonUtility.ToJson(new CreateMapBody { buildingId = buildingId, name = name, trackingQuality = trackingQuality, planeCount = planeCount, confidence = confidence });
            using var req = Post("/indoor/maps", body, true);
            yield return Send(req, text => ok?.Invoke(JsonUtility.FromJson<IndoorMapDto>(text)), err);
        }

        public IEnumerator AddPoint(CreateNodeBody body, Action<IndoorNodeDto> ok, Action<string> err)
        {
            using var req = Post("/indoor/nodes", JsonUtility.ToJson(body), true);
            yield return Send(req, text => ok?.Invoke(JsonUtility.FromJson<IndoorNodeDto>(text)), err);
        }

        public IEnumerator Connect(string mapId, string fromId, string toId, string kind, Action<IndoorEdgeDto> ok, Action<string> err)
        {
            var body = JsonUtility.ToJson(new CreateEdgeBody { mapId = mapId, fromNodeId = fromId, toNodeId = toId, kind = kind, bidirectional = true });
            using var req = Post("/indoor/edges", body, true);
            yield return Send(req, text => ok?.Invoke(JsonUtility.FromJson<IndoorEdgeDto>(text)), err);
        }

        public IEnumerator NamePlace(string mapId, string floorId, string nodeId, string name, string category, Action<IndoorPlaceDto> ok, Action<string> err)
        {
            var body = JsonUtility.ToJson(new CreatePlaceBody { mapId = mapId, floorId = floorId, nodeId = nodeId, name = name, category = category });
            using var req = Post("/indoor/places", body, true);
            yield return Send(req, text => ok?.Invoke(JsonUtility.FromJson<IndoorPlaceDto>(text)), err);
        }

        public IEnumerator CreateQrAnchor(string mapId, string nodeId, string floorId, string code, Action<string> ok, Action<string> err)
        {
            var body = JsonUtility.ToJson(new CreateAnchorBody { mapId = mapId, nodeId = nodeId, floorId = floorId, anchorCode = code, physicalMarkerType = "qr" });
            using var req = Post("/indoor/anchors", body, true);
            yield return Send(req, text => ok?.Invoke(text), err);
        }

        public IEnumerator PublishMap(string mapId, Action ok, Action<string> err)
        {
            using var req = Put($"/indoor/maps/{mapId}", "{\"status\":\"published\"}", true);
            yield return Send(req, _ => ok?.Invoke(), err);
        }

        public IEnumerator ResolveAnchor(string code, Action<string> json, Action<string> err)
        {
            using var req = Get($"/indoor/anchors/{UnityWebRequest.EscapeURL(code)}");
            yield return Send(req, json, err);
        }

        public IEnumerator RouteFromQr(string qr, string destinationPlaceId, Action<IndoorRouteDto> ok, Action<string> err)
        {
            var body = JsonUtility.ToJson(new IndoorRouteBody { sourceAnchorCode = qr, destinationPlaceId = destinationPlaceId });
            using var req = Post("/indoor/route", body);
            yield return Send(req, text => ok?.Invoke(JsonUtility.FromJson<IndoorRouteDto>(text)), err);
        }

        UnityWebRequest Post(string path, string json, bool auth = false)
        {
            var req = new UnityWebRequest($"{apiBaseUrl}{path}", "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            if (auth && !string.IsNullOrEmpty(AccessToken)) req.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
            return req;
        }

        UnityWebRequest Put(string path, string json, bool auth = false)
        {
            var req = new UnityWebRequest($"{apiBaseUrl}{path}", "PUT");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            if (auth && !string.IsNullOrEmpty(AccessToken)) req.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
            return req;
        }

        UnityWebRequest Get(string path)
        {
            var req = UnityWebRequest.Get($"{apiBaseUrl}{path}");
            return req;
        }

        static IEnumerator Send(UnityWebRequest req, Action<string> ok, Action<string> err)
        {
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success) err?.Invoke(req.error);
            else ok?.Invoke(req.downloadHandler.text);
        }

        static string ExtractToken(string json)
        {
            const string key = "\"accessToken\":\"";
            var i = json.IndexOf(key, StringComparison.Ordinal);
            if (i < 0) return null;
            var start = i + key.Length;
            var end = json.IndexOf('"', start);
            return end < 0 ? null : json.Substring(start, end - start);
        }
    }
}
