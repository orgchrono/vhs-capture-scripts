//! PREMIS v3 XML Digital Preservation Metadata Generator (`domain/archive/premis.rs`).

use serde::{Deserialize, Serialize};

/// PREMIS v3 event record documenting digital preservation actions and custody transitions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PremisEvent {
    pub event_id: String,
    pub event_type: String, // e.g., "ingestion", "deinterlacing", "restoration_filtering", "fixity check"
    pub event_datetime: String,
    pub event_detail: String,
    pub event_outcome: String, // e.g., "success"
    pub linking_agent_id: String,
}

/// PREMIS v3 agent record representing hardware, software, or organizations performing archival actions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PremisAgent {
    pub agent_id: String,
    pub agent_name: String, // e.g., "VHS Studio Pro Native Engine v2.1.0"
    pub agent_type: String, // e.g., "software"
}

/// Pure PREMIS v3 XML preservation metadata generator for archival masters.
#[must_use]
pub fn generate_premis_v3_xml(
    filename: &str,
    size_bytes: u64,
    sha256_hex: &str,
) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<premis xmlns="http://www.loc.gov/premis/v3" version="3.0">
  <object xsi:type="file" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{filename}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <size>{size_bytes}</size>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{sha256_hex}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{filename}</originalName>
  </object>
</premis>
"#
    )
}

/// Pure PREMIS v3 XML generator representing complete OAIS derivation relationship, events, and agents.
#[must_use]
pub fn generate_full_premis_v3_xml(
    source_file: &str,
    source_sha256: &str,
    master_file: &str,
    master_size: u64,
    master_sha256: &str,
    events: &[PremisEvent],
    agents: &[PremisAgent],
) -> String {
    generate_full_premis_v3_xml_with_dip(
        source_file,
        source_sha256,
        master_file,
        master_size,
        master_sha256,
        None,
        events,
        agents,
    )
}

/// Pure PREMIS v3 XML generator supporting DIP proxy derivation representation (`video/mp4`, `compositionLevel=0`).
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn generate_full_premis_v3_xml_with_dip(
    source_file: &str,
    source_sha256: &str,
    master_file: &str,
    master_size: u64,
    master_sha256: &str,
    dip_info: Option<(&str, u64, &str)>,
    events: &[PremisEvent],
    agents: &[PremisAgent],
) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<premis xmlns="http://www.loc.gov/premis/v3" version="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
"#,
    );

    // Source Object
    xml.push_str(&format!(
        r#"  <object xsi:type="file">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{source_file}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{source_sha256}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{source_file}</originalName>
  </object>
"#
    ));

    // Master Object (with derivation relationship to source)
    xml.push_str(&format!(
        r#"  <object xsi:type="file">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{master_file}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <size>{master_size}</size>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{master_sha256}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{master_file}</originalName>
    <relationship>
      <relationshipType>derivation</relationshipType>
      <relationshipSubType>has source</relationshipSubType>
      <relatedObjectIdentifier>
        <relatedObjectIdentifierType>local</relatedObjectIdentifierType>
        <relatedObjectIdentifierValue>{source_file}</relatedObjectIdentifierValue>
      </relatedObjectIdentifier>
    </relationship>
  </object>
"#
    ));

    // Optional DIP Proxy Object (derived from Master Object)
    if let Some((dip_file, dip_size, dip_sha256)) = dip_info {
        xml.push_str(&format!(
            r#"  <object xsi:type="file">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{dip_file}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <compositionLevel>0</compositionLevel>
      <size>{dip_size}</size>
      <format>
        <formatDesignation>
          <formatName>video/mp4</formatName>
        </formatDesignation>
      </format>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{dip_sha256}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{dip_file}</originalName>
    <relationship>
      <relationshipType>derivation</relationshipType>
      <relationshipSubType>has source</relationshipSubType>
      <relatedObjectIdentifier>
        <relatedObjectIdentifierType>local</relatedObjectIdentifierType>
        <relatedObjectIdentifierValue>{master_file}</relatedObjectIdentifierValue>
      </relatedObjectIdentifier>
    </relationship>
  </object>
"#
        ));
    }

    // Preservation Events
    for ev in events {
        xml.push_str(&format!(
            r#"  <event>
    <eventIdentifier>
      <eventIdentifierType>local</eventIdentifierType>
      <eventIdentifierValue>{}</eventIdentifierValue>
    </eventIdentifier>
    <eventType>{}</eventType>
    <eventDateTime>{}</eventDateTime>
    <eventDetailInformation>
      <eventDetail>{}</eventDetail>
    </eventDetailInformation>
    <eventOutcomeInformation>
      <eventOutcome>{}</eventOutcome>
    </eventOutcomeInformation>
    <linkingAgentIdentifier>
      <linkingAgentIdentifierType>local</linkingAgentIdentifierType>
      <linkingAgentIdentifierValue>{}</linkingAgentIdentifierValue>
    </linkingAgentIdentifier>
    <linkingObjectIdentifier>
      <linkingObjectIdentifierType>local</linkingObjectIdentifierType>
      <linkingObjectIdentifierValue>{master_file}</linkingObjectIdentifierValue>
    </linkingObjectIdentifier>
  </event>
"#,
            ev.event_id, ev.event_type, ev.event_datetime, ev.event_detail, ev.event_outcome, ev.linking_agent_id
        ));
    }

    // Preservation Agents
    for ag in agents {
        xml.push_str(&format!(
            r#"  <agent>
    <agentIdentifier>
      <agentIdentifierType>local</agentIdentifierType>
      <agentIdentifierValue>{}</agentIdentifierValue>
    </agentIdentifier>
    <agentName>{}</agentName>
    <agentType>{}</agentType>
  </agent>
"#,
            ag.agent_id, ag.agent_name, ag.agent_type
        ));
    }

    xml.push_str("</premis>\n");
    xml
}
