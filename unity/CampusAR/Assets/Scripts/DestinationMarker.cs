using UnityEngine;

namespace CampusAR
{
    public class DestinationMarker : MonoBehaviour
    {
        [SerializeField] private Transform marker;

        public void SetDestination(float latitude, float longitude)
        {
            // Placeholder world offset from lat/lon origin — swap for AR geospatial / BLE later.
            if (marker == null) return;
            marker.localPosition = new Vector3((longitude + 122.419f) * 10000f, 0f, (latitude - 37.7748f) * 10000f);
            marker.gameObject.SetActive(true);
        }
    }
}
