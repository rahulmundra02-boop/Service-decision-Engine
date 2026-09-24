# Part Master, Part Standardization and Schedule History Logic

## Purpose

This document defines the intended separation between the three part-related layers used by the Service Decision Engine.

The objective is to make future part-number maintenance simple for the Admin user without changing the established Service Decision logic unnecessarily.

## 1. Part Master

**Purpose:** Maintain the Part Numbers / Labour Codes that belong to a service category.

Examples of categories include:

- Engine Oil
- Engine Oil Filter
- Fuel Filter
- Fuel Filter Kit
- Air Filter
- Air Filter Kit
- Steering Oil
- Steering Oil Filter
- DEF Filter Suction
- DEF Filter Air
- DEF Filter Kit
- DEF Inline Filter
- Gear Oil
- APDA Filter
- Coolant
- Hub Grease
- Axle Oil
- Clutch Oil

The Part Master is intended to be the maintainable master list. When a new valid Part Number / Labour Code is introduced, the Admin should be able to add it to the appropriate category without modifying the application source code.

The Part Master must not change the service interval, quantity, vehicle-model, tipper, AMC, or other established decision rules. It only identifies which uploaded Excel records belong to a particular service category.

## 2. Part Standardization

**Purpose:** Convert different representations of the same part into a consistent internal/display representation where required by the application.

Part Standardization is separate from the Part Master.

It may be used for:

- Consistent part naming in history.
- Display purposes.
- Existing legacy records.
- Existing application functions that require a standardized part description.
- Preventing minor naming variations from creating inconsistent display results.

Part Standardization should not silently replace the Part Master for Service Decision classification unless that behavior is explicitly designed and tested.

The uploaded Excel structure remains unchanged. The application continues to use the existing Excel columns, including Part No / Labour Code and Part Description.

## 3. Schedule Service History / Full History Highlighting

**Purpose:** Control which historical items are shown or highlighted in the vehicle service history.

This is a presentation/history layer and is separate from the Service Decision calculation.

The system should be able to identify relevant history records using the maintained part information and then:

- Show applicable items in Schedule Service History.
- Highlight applicable items in Full History.
- Keep unrelated historical parts visible in Full History when required.
- Avoid changing the actual service-due calculation merely because an item is displayed or highlighted.

## Important Separation

The three layers must remain logically separate:

**Part Master**
→ identifies Part Numbers / Labour Codes for service categories.

**Part Standardization**
→ handles consistent naming/representation.

**Schedule Service History**
→ controls history visibility/highlighting.

None of these layers should independently modify the established Service Decision rules.

## Maintenance Principle

The preferred future workflow is:

1. Admin updates a Part Number / Labour Code in the Part Master.
2. The updated master becomes available to the Service Decision Engine.
3. Existing decision rules use that master for part identification.
4. Part Standardization continues to serve its own existing purpose.
5. Schedule Service History / Full History highlighting uses the appropriate maintained part information.

This design is intended to remove the need for routine Part Number additions to require direct source-code editing.

## Compatibility Requirement

The existing Excel upload format is authoritative and must not be changed merely to support the Part Master.

The application must continue to accept the existing vehicle-history Excel format with its existing headers and fields.

Any future change to these three layers must preserve the currently working Service Decision rules unless a specific rule change is intentionally requested and tested.
