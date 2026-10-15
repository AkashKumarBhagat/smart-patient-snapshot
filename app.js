(function () {
  "use strict";

  var REQUEST_OPTIONS = { pageLimit: 1, flat: true };

  // LOINC codes we display, in table order.
  var VITALS = [
    { code: "85354-9", label: "Blood Pressure" },
    { code: "8867-4", label: "Heart Rate" },
    { code: "9279-1", label: "Respiratory Rate" },
    { code: "8310-5", label: "Body Temperature" },
    { code: "29463-7", label: "Body Weight" },
    { code: "8302-2", label: "Body Height" },
    { code: "39156-5", label: "BMI" }
  ];
  var SYSTOLIC = "8480-6";
  var DIASTOLIC = "8462-4";

  var statusEl = document.getElementById("status");

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("error", !!isError);
    // Clearing the status (success) or showing an error ends the loading state,
    // which hides the skeleton placeholders.
    if (isError || !message) document.body.classList.remove("loading");
  }

  // ---------- Generic helpers ----------

  function codeableText(cc) {
    if (!cc) return "";
    if (cc.text) return cc.text;
    var codings = cc.coding || [];
    for (var i = 0; i < codings.length; i++) {
      if (codings[i].display) return codings[i].display;
    }
    return codings.length ? codings[0].code || "" : "";
  }

  function hasLoinc(cc, code) {
    var codings = (cc && cc.coding) || [];
    return codings.some(function (c) {
      return c.code === code && (!c.system || c.system === "http://loinc.org");
    });
  }

  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    // Date-only values (YYYY-MM-DD) are parsed as UTC; show them as-is to avoid off-by-one days.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // Friendlier labels for common UCUM unit codes.
  var UNIT_LABELS = {
    "mm[Hg]": "mmHg",
    "Cel": "°C",
    "[degF]": "°F",
    "kg/m2": "kg/m²",
    "[lb_av]": "lb",
    "[in_i]": "in"
  };

  function displayUnit(unit) {
    return Object.prototype.hasOwnProperty.call(UNIT_LABELS, unit) ? UNIT_LABELS[unit] : unit;
  }

  function formatQuantity(q) {
    if (!q || q.value === undefined || q.value === null) return "";
    var value = Math.round(q.value * 100) / 100;
    var unit = displayUnit(q.unit || q.code || "");
    return unit ? value + " " + unit : String(value);
  }

  function uniqueSorted(items) {
    var seen = {};
    var result = [];
    items.forEach(function (item) {
      var text = (item || "").trim();
      var key = text.toLowerCase();
      if (text && !seen[key]) {
        seen[key] = true;
        result.push(text);
      }
    });
    return result.sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderList(listEl, items) {
    listEl.textContent = "";
    if (!items.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "None recorded";
      listEl.appendChild(li);
      return;
    }
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      listEl.appendChild(li);
    });
  }

  // ---------- Patient ----------

  function patientName(patient) {
    var names = patient.name || [];
    var name = names.find(function (n) { return n.use === "official"; }) || names[0];
    if (!name) return "Unknown patient";
    if (name.text) return name.text;
    var parts = (name.given || []).concat(name.family ? [name.family] : []);
    return parts.join(" ") || "Unknown patient";
  }

  function calculateAge(birthDate) {
    if (!birthDate) return null;
    var parts = birthDate.split("-").map(Number);
    if (!parts[0]) return null;
    var today = new Date();
    var age = today.getFullYear() - parts[0];
    var month = parts[1] || 1;
    var day = parts[2] || 1;
    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
      age--;
    }
    return age;
  }

  function initials(name) {
    var words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    var first = words[0].charAt(0);
    var last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
    return (first + last).toUpperCase();
  }

  function renderPatient(patient) {
    var name = patientName(patient);
    document.getElementById("patient-name").textContent = name;
    document.getElementById("patient-avatar").textContent = initials(name);
    document.title = name + " – Patient Snapshot";

    var chips = [];
    if (patient.gender) chips.push({ text: patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) });
    if (patient.birthDate) {
      var age = calculateAge(patient.birthDate);
      if (age !== null) chips.push({ text: age + " yrs" });
      chips.push({ text: "DOB " + patient.birthDate });
    }
    chips.push({ text: "ID " + patient.id, mono: true });

    var infoEl = document.getElementById("patient-info");
    infoEl.textContent = "";
    chips.forEach(function (chip) {
      var span = document.createElement("span");
      span.className = chip.mono ? "chip mono" : "chip";
      span.textContent = chip.text;
      infoEl.appendChild(span);
    });
  }

  function setCount(id, n) {
    document.getElementById(id).textContent = n ? String(n) : "";
  }

  // ---------- Vitals ----------

  function observationDate(obs) {
    return obs.effectiveDateTime ||
      (obs.effectivePeriod && (obs.effectivePeriod.end || obs.effectivePeriod.start)) ||
      obs.effectiveInstant ||
      obs.issued ||
      "";
  }

  function observationTime(obs) {
    var t = new Date(observationDate(obs)).getTime();
    return isNaN(t) ? -Infinity : t;
  }

  function bloodPressureValue(obs) {
    var components = obs.component || [];
    function find(code) {
      return components.find(function (c) { return hasLoinc(c.code, code); });
    }
    var sys = find(SYSTOLIC);
    var dia = find(DIASTOLIC);
    var sysVal = sys && sys.valueQuantity ? sys.valueQuantity.value : null;
    var diaVal = dia && dia.valueQuantity ? dia.valueQuantity.value : null;
    if (sysVal === null && diaVal === null) return "";
    var unit = displayUnit((sys && sys.valueQuantity && sys.valueQuantity.unit) ||
      (dia && dia.valueQuantity && dia.valueQuantity.unit) || "mmHg");
    return (sysVal !== null ? Math.round(sysVal) : "–") + "/" +
      (diaVal !== null ? Math.round(diaVal) : "–") + " " + unit;
  }

  function observationValue(obs, code) {
    if (code === "85354-9") return bloodPressureValue(obs);
    if (obs.valueQuantity) return formatQuantity(obs.valueQuantity);
    if (obs.valueCodeableConcept) return codeableText(obs.valueCodeableConcept);
    if (obs.valueString) return obs.valueString;
    return "";
  }

  function renderVitals(observations) {
    var tbody = document.getElementById("vitals-body");
    tbody.textContent = "";

    // Sort newest first client-side in case the server ignored _sort.
    var sorted = observations.slice().sort(function (a, b) {
      return observationTime(b) - observationTime(a);
    });

    var rows = [];
    VITALS.forEach(function (vital) {
      for (var i = 0; i < sorted.length; i++) {
        var obs = sorted[i];
        if (!hasLoinc(obs.code, vital.code)) continue;
        var value = observationValue(obs, vital.code);
        if (!value) continue;
        rows.push({ label: vital.label, value: value, date: formatDate(observationDate(obs)) });
        break; // only the latest per type
      }
    });
    setCount("vitals-count", rows.length);

    if (!rows.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 3;
      td.className = "empty";
      td.textContent = "None recorded";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      [row.label, row.value, row.date].forEach(function (text, idx) {
        var td = document.createElement("td");
        td.textContent = text;
        if (idx === 2) td.className = "date";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Conditions ----------

  function renderConditions(conditions) {
    var names = uniqueSorted(conditions.map(function (c) { return codeableText(c.code); }));
    renderList(document.getElementById("conditions-list"), names);
    setCount("conditions-count", names.length);
  }

  // ---------- Medications ----------

  // Returns a promise resolving to a display name for a MedicationRequest,
  // handling both medicationCodeableConcept and medicationReference.
  function medicationName(client, req) {
    if (req.medicationCodeableConcept) {
      return Promise.resolve(codeableText(req.medicationCodeableConcept));
    }
    var ref = req.medicationReference;
    if (!ref) return Promise.resolve("");
    if (ref.display) return Promise.resolve(ref.display);
    if (!ref.reference) return Promise.resolve("");

    // Contained Medication (e.g. "#med1")
    if (ref.reference.charAt(0) === "#") {
      var id = ref.reference.slice(1);
      var contained = (req.contained || []).find(function (r) {
        return r.resourceType === "Medication" && r.id === id;
      });
      return Promise.resolve(contained ? codeableText(contained.code) : "");
    }

    return client.request(ref.reference)
      .then(function (med) { return codeableText(med.code) || ref.reference; })
      .catch(function (err) {
        console.warn("Could not resolve " + ref.reference, err);
        return ref.reference;
      });
  }

  function renderMedications(client, requests) {
    return Promise.all(requests.map(function (r) { return medicationName(client, r); }))
      .then(function (names) {
        var unique = uniqueSorted(names);
        renderList(document.getElementById("medications-list"), unique);
        setCount("medications-count", unique.length);
      });
  }

  // ---------- Main ----------

  function load(client) {
    var patientId = client.patient.id;
    if (!patientId) throw new Error("No patient selected in launch context.");
    var pid = encodeURIComponent(patientId);

    return Promise.all([
      client.request("Patient/" + pid, REQUEST_OPTIONS),
      client.request("Observation?patient=" + pid + "&category=vital-signs&_sort=-date&_count=200", REQUEST_OPTIONS),
      client.request("Condition?patient=" + pid + "&clinical-status=active", REQUEST_OPTIONS),
      client.request("MedicationRequest?patient=" + pid + "&status=active", REQUEST_OPTIONS)
    ]).then(function (results) {
      var patient = results[0];
      var observations = results[1] || [];
      var conditions = results[2] || [];
      var medRequests = results[3] || [];

      renderPatient(patient);
      renderVitals(observations);
      renderConditions(conditions);
      return renderMedications(client, medRequests);
    });
  }

  // ready() needs either ?state= in the URL (fresh redirect from the auth server)
  // or a SMART session saved in this tab's sessionStorage. Without either, the
  // page was opened directly instead of via launch.html.
  var hasState = new URLSearchParams(window.location.search).has("state");
  var hasSession = false;
  try { hasSession = !!sessionStorage.getItem("SMART_KEY"); } catch (e) { /* storage blocked */ }
  if (!hasState && !hasSession) {
    setStatus("No SMART session found. Launch this app from an EHR or the SMART launcher " +
      "(App Launch URL: " + new URL("launch.html", window.location.href).href + ") " +
      "instead of opening this page directly.", true);
    return;
  }

  FHIR.oauth2.ready()
    .then(load)
    .then(function () { setStatus(""); })
    .catch(function (err) {
      console.error("Patient Snapshot error:", err);
      setStatus("Error: " + (err && err.message ? err.message : String(err)), true);
    });
})();
