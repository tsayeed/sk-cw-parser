import { SearchOutlined, ReloadOutlined, DashboardOutlined } from '@ant-design/icons';
import { blue, green, yellow } from '@ant-design/colors';
import { Button, DatePicker, Space, Select, Tree, Card, Tag, Typography, Layout, Col, Row, Skeleton, Spin } from "antd";
import { useEffect, useState } from "react";
import { JsonViewer } from "@textea/json-viewer";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import utc from 'dayjs/plugin/utc';
import './App.css';
import { Content, Header } from 'antd/es/layout/layout';

dayjs.extend(utc);
dayjs.extend(duration);

const { Text, Title } = Typography;


const base_url = "http://localhost:8000";


function groupEventsByRequestUuid(events) {
  const eventsForRequestId = {}
  for (let logEvent of events) {
    if (!logEvent.request_uuid) continue;

    const requestUuid = logEvent.request_uuid;
    if (eventsForRequestId[requestUuid] === undefined) {
      const node = {
        key: requestUuid,
        title: '',
        isMain: true,
        startTime: dayjs(logEvent.time),
        timeTaken: null,
        event: null,
        children: [],
      }
      eventsForRequestId[requestUuid] = node
    }
    const mainNode = eventsForRequestId[requestUuid];
    const node = {
      key: `${mainNode.key}_${mainNode.children.length}`,
      title: '',
      startTime: dayjs(logEvent.time),
      timeTaken: null,
      event: logEvent,
      isMain: false,
    }
    mainNode.children.push(node)
  }

  return eventsForRequestId;

}


function buildLogNodes(logEvents) {

  const eventsForRequestId = groupEventsByRequestUuid(logEvents)
  const nodes = [];
  const alreadySeenRequestId = new Set();

  for (let event of logEvents) {
    if (!event.request_uuid) {
      nodes.push({ key: event.event_id, title: '', startTime: dayjs(event.time), timeTaken: null, event })
    } else {
      const mainNode = eventsForRequestId[event.request_uuid]
      if (!alreadySeenRequestId.has(event.request_uuid)) {
        nodes.push(mainNode)
        alreadySeenRequestId.add(event.request_uuid)
      }
    }
  }

  return nodes;

}

function showVar(key, name, expr) {
  console.log(name, key, expr);
}


function App() {
  const environments = [{ value: 'docker', label: 'Docker' }, { value: 'cloudwatch', label: 'Cloudwatch' }];
  let [selectedEnvironment, selectEnvironment] = useState(null)

  let [sources, setSources] = useState([]);
  let [selectedSource, selectSource] = useState([]);

  let [startTime, setStartTime] = useState(null);
  let [endTime, setEndTime] = useState(null);

  let [loadingLogs, setLoadingLogs] = useState(false);
  let [logNodes, setLogNodes] = useState([])
  let [selectedVar, selectVar] = useState({ nodeKey: null, varId: null, varName: null, expression: null })

  function fetchSources(_env) {
    console.log("Fetching Sources")
    fetch(`${base_url}/sources?` + new URLSearchParams({ environment: _env })).then(async (r) => {
      const res = await r.json()
      console.log("Received ", res);
      setSources(res['data'].map(v => ({ value: v, label: v })));
    }).catch(e => {
      console.log(e)
    })

  }

  useEffect(() => {
    if (!selectedEnvironment) return;
    selectSource([]);

    fetchSources(selectedEnvironment)
  }, [selectedEnvironment])


  function sendRequest() {
    const params = {
      environment: selectedEnvironment,
      sources: selectedSource.join(','),
      start_time: startTime?.$d.getTime() || null,
      end_time: endTime?.$d.getTime() || null,
    }

    console.log(params)
    setLoadingLogs(true);

    fetch(`${base_url}/logs?` + new URLSearchParams(Object.entries(params).filter(e => e[1]))).then(async (r) => {
      const res = await r.json()
      console.log("Received ", res);
      const logNodes = buildLogNodes(res['data'])
      setLogNodes(logNodes);
      setLoadingLogs(false);
    }).catch(e => {
      console.log(e)
    })
  }



  function logNodeRender(node) {
    let type = "INFO";
    let source, message;

    if (node.isMain) {
      message = node.key;
      source = ''
    } else {
      message = node.event.formatted_message ?? node.event.message
      source = node.event.source.split('/').at(-1).split('-')[0]
      const parts = message.split("|").map(p => p.trim())
      if (parts.length >= 3) {
        type = parts[1];
        message = parts[2];
      }
    }

    let messageNodes = [];

    if (node.isMain) {
      node.timeTaken = node.children.at(-1).startTime.diff(node.children[0].startTime, 'second');
      if (node.timeTaken === 0) node.timeTaken = "<1"
      console.log(node.timeTaken);
    }


    if (!node.isMain && node.event.expressions.length) {
      const messageParts = message.split("$#$")

      for (let i = 0; i < messageParts.length; i++) {
        messageNodes.push(messageParts[i])
        if (i < node.event.expressions.length) {
          const name = `$var_${i}`;
          const var_id = `${node.key}_${name}`
          messageNodes.push((<Tag id={var_id} color={selectedVar.varId === var_id ? 'blue' : ''} onClick={(v) => selectVar({ nodeKey: node.key, varName: name, varId: var_id, expression: node.event.expressions[i] })}>{name}</Tag>))

        }

      }

    } else {
      messageNodes = [message]
    }

    const colorMap = {
      cash: 'blue',
      concierge: 'orange',
      taka: 'red'
    }

    // const borderLeft = source ? {
    //   borderLeftWidth: 10,
    //   borderRadius: 4,
    //   borderLeftColor: colorMap[source] 
    // } : {}



    return (
      <Card size='small' style={{ width: node.isMain ? 500 : 950, padding: 0 }}>
        <p>
          {source ? <Tag color={colorMap[source]}>{source.toUpperCase()}</Tag> : null}
          {type === 'ERROR' ? <Tag color='red'>ERROR</Tag> : null}
          <Text keyboard>{node.startTime.format()}</Text>
          {node.timeTaken ? <Text keyboard><DashboardOutlined /> {node.timeTaken}s</Text> : null}
        </p>
        <p style={{ fontFamily: 'monospace' }}>{messageNodes}</p>
      </Card>
    )
  }

  return (
    <div className="App">
      <Layout style={{ minHeight: '100vh' }}>
        <Space direction='vertical' size='large'>
          <Header style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <Title level={2} style={{ color: 'white', marginBottom: 0, fontFamily: 'monospace', fontWeight: 'normal' }}>[LOGGLY]</Title>
          </Header>
          <Content>
            <Layout style={{ padding: 24 }}>
              <Space align='center' style={{ justifyContent: 'center' }}>
                <Select style={{width: 150}} options={environments} placeholder="Environment" value={selectedEnvironment} onChange={v => selectEnvironment(v)} />
                <Select mode='multiple' style={{ width: 450 }} options={sources} placeholder='Source' value={selectedSource} onChange={v => selectSource(v)} />

                <DatePicker
                  showTime={{
                    format: 'HH:mm',
                  }}
                  placeholder='Start Time'
                  format="YYYY-MM-DD HH:mm"
                  onChange={v => setStartTime(v)}
                  value={startTime}
                />
                {/* <DatePicker
                  showTime={{
                    format: 'HH:mm',
                  }}
                  placeholder='End Time'
                  format="YYYY-MM-DD HH:mm"
                  onChange={v => setEndTime(v)}
                  value={endTime}
                /> */}
                <div style={{ width: 40 }}></div>
                <Button onClick={sendRequest} shape="circle" type="primary" icon={<SearchOutlined />} />

              </Space>
            </Layout>

            <Layout style={{ marginLeft: 100, marginRight: 100 }}>
              <Row style={{ height: 700}}>
                {
                  loadingLogs ? <div style={{ display: 'flex', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                    <Spin size="large" />
                  </div>
                    : (
                      <>
                        <Col span={16}>
                          <h1>Log Events</h1>
                          <Tree className='log-tree' style={{ background: 'transparent' }} height={700} treeData={logNodes} titleRender={logNodeRender} showLine showIcon />
                        </Col>
                        <Col span={8}>
                          <h1>Variables</h1>
                          {selectedVar && selectedVar.expression ? <Space>
                            <JsonViewer style={{ height: 700, overflow: 'auto' }} rootName={selectedVar.varName} value={selectedVar.expression} />
                          </Space> : <Space />}

                        </Col>
                      </>

                    )
                }
              </Row>
            </Layout>

          </Content>
        </Space>



      </Layout>
    </div>
  );
}

export default App;
