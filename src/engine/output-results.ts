/* eslint-disable guard-for-in */
/* eslint-disable max-len */

import {
  Pathway,
  PathwayResults,
  PatientData,
  CriteriaResult,
  DocumentationResource,
  State,
  GuidanceState,
  CriteriaResultItem
} from 'pathways-model';
import { DocumentReference, DomainResource } from 'fhir-objects';
interface StateData {
  documentation: DocumentationResource | string | null;
  nextState: string | null;
  status: string;
}

/**
 * Engine function to take in the ELM patient results and output data relating to the patient's pathway
 * @param pathway - the entire pathway
 * @param patientData - the data on the patient from a CQL execution. Note this is a single patient not the entire patientResults object
 * @return returns a JSON object describing where the patient is on the given pathway
 *  {
 *    currentState - the name of the state patient is currently in
 *    currentStatus - the status of the patient in the current state (from FHIR resource)
 *          A status of unknown could be the resource returned an unknown status or the resource has no status at all
 *    path - list of the names of states in the patient's pathway
 *    documentation - list of documentation for the trace of the pathway (documentation is corresponding resource)
 *  }
 */
export function pathwayData(
  pathway: Pathway,
  patientData: PatientData,
  resources: DomainResource[]
): PathwayResults {
  const startState = 'Start';
  let currentStatus;
  const patientDocumentation = [];
  const evaluatedPathway = [startState];

  let stateData = nextState(pathway, patientData, startState, resources);
  while (stateData !== null) {
    currentStatus = stateData.status;
    if (stateData.documentation !== null)
      patientDocumentation.push(retrieveResource(stateData.documentation, resources));
    if (stateData.nextState === null) break; // The position of this line is important to maintain consistency for different scenarios
    evaluatedPathway.push(stateData.nextState);
    stateData = nextState(pathway, patientData, stateData.nextState, resources);
  }
  const currentStateName = evaluatedPathway[evaluatedPathway.length - 1];
  const currentState = pathway.states[currentStateName];
  return {
    patientId: patientData.Patient.id.value,
    currentState: [currentStateName],
    currentStatus: currentStatus,
    nextRecommendation: nextStateRecommendation(currentState),
    path: evaluatedPathway,
    documentation: patientDocumentation
  };
}

/**
 * Engine function to take in the ELM patient results and output data relating to the pathway criteria
 * @param pathway - the entire pathway
 * @param patientData - the data on the patient from a CQL execution. Note this is a single patient not the entire patientResults object
 * @return returns CriteriaResult containing the expected and actual value for one data element
 */
export function criteriaData(pathway: Pathway, patientData: PatientData): CriteriaResult {
  const resultItems: CriteriaResultItem[] = [];

  let matches = 0;
  pathway.criteria.forEach(criteria => {
    let evaluationResult = patientData[criteria.elementName];
    if (Array.isArray(evaluationResult)) {
      evaluationResult = evaluationResult[0]; // TODO: add functionality for multiple resources
    }
    let actual = 'unknown';
    let match = false;

    if (evaluationResult) {
      actual = evaluationResult['value'];
      match = evaluationResult['match'];
    }

    if (match) matches += 1;

    const criteriaResultItem = {
      elementName: criteria.elementName,
      expected: criteria.expected,
      actual,
      match
    };

    resultItems.push(criteriaResultItem);
  });

  return {
    pathwayName: pathway.name,
    matches: matches,
    criteriaResultItems: resultItems
  };
}

/**
 * Helper function to set the next recommendation
 * @param state - the current state in the pathway (where the patient is)
 * @return "pathway terminal" if state is the end of the pathway
 *        the name of the next state in a direct transition
 *        an object describing possible transitions and descriptions
 */
function nextStateRecommendation(state: State): string | object {
  const transitions = state.transitions;
  if (transitions.length === 0) return 'pathway terminal';
  else if (transitions.length === 1) return transitions[0].transition;
  else {
    return transitions.map(transition => {
      return {
        state: transition.transition,
        conditionDescription:
          'condition' in transition ? transition.condition && transition.condition.description : ''
      };
    });
  }
}

/**
 * Helper function to format the documentation and include the related state
 * @param resource - the resource returned by the CQL execution
 * @param state - the current state name
 * @return the JSON resource with the state property set
 */
function formatDocumentation(
  resource: DocumentationResource,
  state: string
): DocumentationResource {
  resource.state = state;
  return resource;
}

/**
 * Helper function to select the transition state
 * This function is needed because MedicationRequests can have multiple
 * different statuses to indiciate complete
 * @param resource - the resource returned by the CQL execution
 * @param currentState - the current state
 * @return the next state name or null
 */
function formatNextState(resource: DocumentationResource, currentState: State): string | null {
  if (resource.resourceType === 'MedicationRequest') {
    return currentState.transitions.length !== 0 ? currentState.transitions[0].transition : null;
  } else {
    return resource.status === 'completed' && currentState.transitions.length !== 0
      ? currentState.transitions[0].transition
      : null;
  }
}

/**
 * Determine the nextState in a conditional transition state
 * @param patientData - JSON object representing the data on a patient
 * @param currentState - the current state
 * @param currentStateName - the name of the current state
 * @return the next state
 */
function getConditionalNextState(
  patientData: PatientData,
  currentState: State,
  currentStateName: string,
  resources: DomainResource[]
): StateData {
  for (const transition of currentState.transitions) {
    if (transition.condition) {
      let documentationResource: DocumentationResource | null = null;
      if (patientData[transition.condition.description].length)
        // TODO: add functionality for multiple resources
        documentationResource = patientData[transition.condition.description][0];
      else {
        const documentReference = retrieveNote(transition.condition.description, resources);
        if (documentReference) {
          documentationResource = {
            resourceType: 'DocumentReference',
            id: documentReference.id ? documentReference.id : 'unknown',
            status: documentReference.status,
            state: currentStateName,
            resource: documentReference
          };
        }
      }

      if (documentationResource) {
        return {
          nextState: transition.transition,
          documentation: formatDocumentation(documentationResource, currentStateName),
          status: documentationResource.status
        };
      }
    }
  }

  // No matching resource in the patient data to move from state
  return noMatchingResourceForState();
}

/**
 * No resource exists for the next state
 * @return empty object
 */
function noMatchingResourceForState(): StateData {
  return {
    nextState: null,
    documentation: null,
    status: 'not-done'
  };
}

/**
 * Helper function to traverse the pathway and determine the next state in a patients pathway.
 * For actions this function will also verify the move is valid by the resource status
 * @param pathway - JSON object representing the complete pathway
 * @param patientData - JSON object representing the data on a patient
 * @param currentStateName - the name of the current state in the traversal
 * @return returns object with the next state, the status, and the evidenvce
 */
function nextState(
  pathway: Pathway,
  patientData: PatientData,
  currentStateName: string,
  resources: DomainResource[]
): StateData | null {
  const currentState: State | GuidanceState = pathway.states[currentStateName];
  if ('action' in currentState) {
    let resource = patientData[currentStateName];
    if (resource?.length) {
      resource = resource[0]; // TODO: add functionality for multiple resources
      return {
        nextState: formatNextState(resource, currentState),
        documentation: formatDocumentation(resource, currentStateName),
        status: 'status' in resource ? resource.status : 'unknown'
      };
    } else {
      // Check for note posted on decline
      const documentReference = retrieveNote(currentState.label, resources);
      if (documentReference) {
        const doc = {
          resourceType: 'DocumentReference',
          id: documentReference.id ? documentReference.id : 'unknown',
          status: 'status' in documentReference ? documentReference.status : 'unknown',
          state: currentStateName,
          resource: documentReference
        };
        return {
          nextState: formatNextState(doc, currentState),
          documentation: formatDocumentation(doc, currentStateName),
          status: doc.status
        };
      }
      // Action exists but has no matching resource in patientData
      return noMatchingResourceForState();
    }
  } else if (currentState.transitions.length === 1) {
    return {
      nextState: currentState.transitions[0].transition,
      documentation: 'direct',
      status: 'completed'
    };
  } else if (currentState.transitions.length > 1) {
    return getConditionalNextState(patientData, currentState, currentStateName, resources);
  } else return null;
}

function retrieveNote(condition: string, resources: DomainResource[]): DocumentReference | null {
  const documentReference = resources.find(resource => {
    if (resource.resourceType !== 'DocumentReference') return false;
    const documentReference = resource as DocumentReference;
    if (documentReference.identifier === undefined) return false;
    for (const identifier of documentReference.identifier) {
      if (
        identifier.system === 'pathways.documentreference' &&
        identifier.value === btoa(condition)
      )
        return true;
    }
    return false;
  });

  if (!documentReference) return null;

  return documentReference as DocumentReference;
}

function retrieveResource(
  doc: DocumentationResource | string,
  resources: DomainResource[]
): DocumentationResource | string {
  if (typeof doc !== 'string' && resources) {
    doc.resource = resources.find(resource => {
      return resource.resourceType === doc.resourceType && resource.id === doc.id;
    });
  }

  return doc;
}
