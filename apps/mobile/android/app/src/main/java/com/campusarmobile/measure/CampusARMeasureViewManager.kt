package com.campusarmobile.measure

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class CampusARMeasureViewManager : SimpleViewManager<CampusARMeasureView>() {
  override fun getName(): String = "CampusARMeasureView"

  override fun createViewInstance(reactContext: ThemedReactContext): CampusARMeasureView =
    CampusARMeasureView(reactContext)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
    mapOf("onMeasureEvent" to mapOf("registrationName" to "onMeasureEvent"))
}
