using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace CampusAR
{
    [Serializable]
    public class AuthTokens
    {
        public string accessToken;
        public string refreshToken;
    }

    [Serializable]
    public class AuthUser
    {
        public string id;
        public string name;
        public string role;
    }

    [Serializable]
    public class AuthResponse
    {
        public AuthUser user;
        public AuthTokens tokens;
    }

    [Serializable]
    public class RouteStep
    {
        public string nodeId;
        public float latitude;
        public float longitude;
        public string instruction;
        public float distanceM;
        public float bearing;
    }

    [Serializable]
    public class RouteResponse
    {
        public RouteStep[] path;
        public string[] nodeIds;
        public string[] edgeIds;
        public float totalDistanceM;
        public float etaMinutes;
        public float cost;
    }

    [Serializable]
    public class RouteRequestBody
    {
        public string sourceNodeId;
        public string destinationNodeId;
    }

    public class ApiClient : MonoBehaviour
    {
        [SerializeField] private string apiBaseUrl = "http://localhost:4000/api";
        public string AccessToken { get; private set; }

        public IEnumerator GuestLogin(string name, Action<AuthResponse> onSuccess, Action<string> onError)
        {
            var body = Encoding.UTF8.GetBytes($"{{\"name\":\"{name}\"}}");
            using var req = new UnityWebRequest($"{apiBaseUrl}/auth/guest", "POST");
            req.uploadHandler = new UploadHandlerRaw(body);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke(req.error);
                yield break;
            }
            var res = JsonUtility.FromJson<AuthResponse>(req.downloadHandler.text);
            AccessToken = res.tokens.accessToken;
            onSuccess?.Invoke(res);
        }

        public IEnumerator GetRoute(string sourceNodeId, string destinationNodeId, Action<RouteResponse> onSuccess, Action<string> onError)
        {
            var payload = JsonUtility.ToJson(new RouteRequestBody
            {
                sourceNodeId = sourceNodeId,
                destinationNodeId = destinationNodeId
            });
            using var req = new UnityWebRequest($"{apiBaseUrl}/navigation/route", "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(payload));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            if (!string.IsNullOrEmpty(AccessToken))
                req.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke(req.error);
                yield break;
            }
            onSuccess?.Invoke(JsonUtility.FromJson<RouteResponse>(req.downloadHandler.text));
        }
    }
}
