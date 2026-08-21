# Third-party notices

## AR-Measure

The indoor camera measurement workflow and 3D vector-distance behavior were
adapted from [AR-Measure](https://github.com/lightlessdays/AR-Measure) by
lightlessdays / AltRealityLabs.

- Upstream license: Apache License 2.0
- Upstream implementation:
  `Assets/Scripts/LineManager.cs`
- CampusAR modifications: the Unity/ARFoundation placement flow was reworked
  as a WebXR hit-test workflow; measurements are converted into CampusAR
  floor-plan meters and persisted as versioned indoor room geometry and
  dimensions.

The Apache License 2.0 text is available at
<https://www.apache.org/licenses/LICENSE-2.0>.

Unity XR Interaction Toolkit and Unity assets were not copied into the web
application. They are Unity-specific and subject to their own license terms.
