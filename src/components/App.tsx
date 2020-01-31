import React, { FC, useState, useEffect } from 'react';
import Header from 'components/Header';
import Navigation from 'components/Navigation';
import { PathwaysClient } from 'pathways-client';
import logo from 'camino-logo-dark.png';
import { getPatientRecord } from '../utils/fhirExtract';
import { FHIRClientProvider } from './FHIRClient';
import { PatientProvider } from './PatientProvider';
import PatientRecord from './PatientRecord/PatientRecord';
import Graph from './Graph';
import config from 'utils/ConfigManager';
import PathwaysList from './PathwaysList';
import { PathwayProvider } from './PathwayProvider';
import { EvaluatedPathway } from 'pathways-model';
import useGetPathwaysService from './PathwaysService/PathwaysService';

interface AppProps {
  client: PathwaysClient; // TODO: fhirclient.Client
}

const App: FC<AppProps> = ({ client }) => {
  const [patientRecords, setPatientRecords] = useState<Array<fhir.DomainResource>>([]);
  const [currentPathway, setCurrentPathway] = useState<EvaluatedPathway | null>(null);
  const [selectPathway, setSelectPathway] = useState<boolean>(true);
  const [evaluatedPathways, setEvaluatedPathways] = useState<EvaluatedPathway[]>([]);

  useEffect(() => {
    getPatientRecord(client).then((records: Array<fhir.DomainResource>) => {
      // filters out values that are empty
      // the server might return deleted
      // resources that only include an
      // id, meta, and resourceType
      const values = ['id', 'meta', 'resourceType'];
      records = records.filter(resource => {
        return !Object.keys(resource).every(value => values.includes(value));
      });
      setPatientRecords(records);
    });
  }, [client]);

  const service = useGetPathwaysService(config.get('pathwaysService'));

  useEffect(() => {
    if (service.status === 'loaded' && evaluatedPathways.length === 0)
      setEvaluatedPathways(
        service.payload.map(pathway => ({ pathway: pathway, pathwayResults: null }))
      );
  }, [service, evaluatedPathways.length, client]);

  function setEvaluatedPathwayCallback(
    value: EvaluatedPathway | null,
    selectPathway = false
  ): void {
    window.scrollTo(0, 0);
    setSelectPathway(selectPathway);
    setCurrentPathway(value);
  }

  function updateEvaluatedPathways(value: EvaluatedPathway): void {
    const newList = [...evaluatedPathways]; // Create a shallow copy of list
    for (let i = 0; i < evaluatedPathways.length; i++) {
      if (evaluatedPathways[i].pathway.name === value.pathway.name) {
        newList[i] = value;
        setEvaluatedPathways(newList);
      }
    }

    if (currentPathway?.pathway.name === value.pathway.name) {
      setCurrentPathway(value);
    }
  }

  interface PatientViewProps {
    evaluatedPathway: EvaluatedPathway | null;
  }

  const PatientView: FC<PatientViewProps> = ({ evaluatedPathway }) => {
    return (
      <div>
        <div>{`Fetched ${patientRecords.length} resources`}</div>
        {evaluatedPathway ? (
          <Graph
            resources={patientRecords}
            evaluatedPathway={evaluatedPathway}
            expandCurrentNode={true}
            updateEvaluatedPathways={updateEvaluatedPathways}
          />
        ) : (
          <div>No Pathway Loaded</div>
        )}
        <PatientRecord resources={patientRecords} />
      </div>
    );
  };

  return (
    <FHIRClientProvider client={client}>
      <PatientProvider>
        <PathwayProvider
          pathwayCtx={{
            evaluatedPathway: currentPathway,
            setEvaluatedPathway: setEvaluatedPathwayCallback,
            updateEvaluatedPathways: updateEvaluatedPathways
          }}
        >
          <div>
            <Header logo={logo} />
            <Navigation
              evaluatedPathways={evaluatedPathways}
              selectPathway={selectPathway}
              setSelectPathway={setSelectPathway}
            />
          </div>
          {selectPathway ? (
            <PathwaysList
              evaluatedPathways={evaluatedPathways}
              callback={setEvaluatedPathwayCallback}
              service={service}
              resources={patientRecords}
            ></PathwaysList>
          ) : (
            <PatientView evaluatedPathway={currentPathway} />
          )}
        </PathwayProvider>
      </PatientProvider>
    </FHIRClientProvider>
  );
};

export default App;
