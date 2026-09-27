# Service Estimate Android App

Separate React Native / Expo Android app for:
- Service Estimate: Vehicle -> Aggregate -> automatic applicable parts/labour -> editable.
- Repair Estimate: Vehicle -> blank parts/labour -> manual entry.
- Both use the existing Service Decision backend for vehicle data, historical rates, save, and authentication.
- Historical part rates use the existing Post Warranty / Paid Order rule and 18% GST presentation.

This app is isolated under android-estimate/ and does not modify the website UI or website branches.
