using UnityEngine;

namespace CampusAR
{
    public class ArrowGuide : MonoBehaviour
    {
        [SerializeField] private Transform arrow;

        public void SetBearing(float bearingDegrees)
        {
            if (arrow == null) return;
            arrow.localRotation = Quaternion.Euler(0f, bearingDegrees, 0f);
        }
    }
}
