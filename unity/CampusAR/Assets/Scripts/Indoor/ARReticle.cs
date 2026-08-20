using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CampusAR.Indoor
{
    /// <summary>
    /// AR Measure-style reticle: raycast against detected planes, smoothed pose.
    /// Does not create graph points by itself.
    /// </summary>
    public class ARReticle : MonoBehaviour
    {
        [SerializeField] ARRaycastManager raycastManager;
        [SerializeField] Transform reticle;
        [SerializeField] float smooth = 18f;
        [SerializeField] float maxHitDistance = 8f;

        public bool HasHit { get; private set; }
        public Pose HitPose { get; private set; }
        public float HitDistance { get; private set; }
        public TrackableId PlaneId { get; private set; }

        static readonly System.Collections.Generic.List<ARRaycastHit> Hits = new();

        void LateUpdate()
        {
            HasHit = false;
            if (raycastManager == null || Camera.main == null) return;

            var screen = new Vector2(Screen.width / 2f, Screen.height / 2f);
            if (!raycastManager.Raycast(screen, Hits, TrackableType.PlaneWithinPolygon))
            {
                if (reticle) reticle.gameObject.SetActive(false);
                return;
            }

            var hit = Hits[0];
            HitDistance = Vector3.Distance(Camera.main.transform.position, hit.pose.position);
            if (HitDistance > maxHitDistance)
            {
                if (reticle) reticle.gameObject.SetActive(false);
                return;
            }

            HasHit = true;
            PlaneId = hit.trackableId;
            var target = hit.pose;
            if (!reticle.gameObject.activeSelf)
            {
                reticle.SetPositionAndRotation(target.position, target.rotation);
                reticle.gameObject.SetActive(true);
            }
            else
            {
                reticle.position = Vector3.Lerp(reticle.position, target.position, Time.deltaTime * smooth);
                reticle.rotation = Quaternion.Slerp(reticle.rotation, target.rotation, Time.deltaTime * smooth);
            }
            HitPose = new Pose(reticle.position, reticle.rotation);
        }
    }
}
