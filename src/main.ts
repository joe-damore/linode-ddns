import { baseRequest, getDomains, getDomainRecords, ResourcePage, deleteDomainRecord, createDomainRecord } from '@linode/api-v4';

const IPV4_FETCH_ENDPOINT = 'https://ipinfo.io/ip';
const IPV6_FETCH_ENDPOINT = 'https://v6.ipinfo.io/ip';

const getPublicIpAddress = async (ipType: 'v4' | 'v6' = 'v4'): Promise<string | null> => {
  const fetchEndpoint = ipType === 'v4'
    ? IPV4_FETCH_ENDPOINT
    : IPV6_FETCH_ENDPOINT;

  try {
    const response = await fetch(fetchEndpoint);
    const ipv4 = await response.text();

    if (!ipv4) {
      return null;
    }

    return ipv4;
  }
  catch (_e) {
    return null;
  }
};

interface UpdateDomainRecordOptions {
  domain: string;
  hostname: string;
}

type ResultGenerator<T> = (page: number) => Promise<ResourcePage<T>>;

const depaginate = async <T>(
  resultGenerator: ResultGenerator<T>
): Promise<T[]> => {
  const firstResult: ResourcePage<T> = await resultGenerator(1);
  const data = firstResult.data;

  if (firstResult.pages > 1) {
    const remainingResults = firstResult.pages - 1;
    const remainingResultsPromises = Array(remainingResults)
      .fill(null)
      .map(async (_element: null, index: number) => {
        const pageNumber = index + 2;
        const results = await resultGenerator(pageNumber);
        return results.data;
      });

    const remainingResultsResponses = await Promise.all(remainingResultsPromises);

    return [
      ...data,
      ...remainingResultsResponses.reduce((acc, cur) => {
        return [...acc, ...cur];
      }, []),
    ]
  }

  return data;
}

const updateDomainRecords = async (domainName: string, hostname: string) => {
  const [ipv4, ipv6] = await Promise.all([
    getPublicIpAddress('v4'),
    getPublicIpAddress('v6'),
  ]);

  if (!ipv4 && !ipv6) {
    throw new Error('Failed to update domain record. No IPv4 or IPv6 address could be retrieved for the host.');
  }

  const domains = await depaginate((page) => getDomains({ page }));
  const desiredDomain = domains.find((domain) => domain.domain === domainName);

  if (!desiredDomain) {
    throw new Error(`Failed to update domain record. No domain named '${domainName}' exists on Linode account.`)
  }

  const records = await depaginate((page) => getDomainRecords(desiredDomain.id, { page }));
  const existingRecords = records.filter((record) => (record.type === 'A' || record.type === 'AAAA') && record.name === hostname);

  // If necessary, create new domain records.
  await Promise.all([ipv4, ipv6].map((ip) => {
    if (!ip) {
      return;
    }

    if (existingRecords.find((record) => record.target === ip)) {
      return;
    }

    return createDomainRecord(desiredDomain.id, {
      type: ip === ipv4 ? 'A' : 'AAAA',
      name: hostname,
      target: ip,
    });
  }));

  // Delete obsolete records.
  await Promise.all(existingRecords.map((existingRecord) => {
    if ((existingRecord.type === 'A' || existingRecord.type === 'AAAA') && existingRecord.name === hostname && ![ipv4, ipv6].includes(existingRecord.target)) {
      return deleteDomainRecord(desiredDomain.id, existingRecord.id);
    }
  }));
};


(async () => {
  const configPath = Deno.args[0] || 'linode-ddns.json';
  console.info(`Looking for configuration file at '${configPath}'...`);

  try {
    const configText = await Deno.readTextFile(configPath);
    const configData = JSON.parse(configText);

    const token = configData['token'];
    const domain = configData['domain'];
    const hostname = configData['hostname'];

    if (!token) {
      throw new Error('No `token` specified in configuration file. Please specify a Linode API-v4 personal access token.');
    }

    if (!domain) {
      throw new Error('No `domain` specified in configuration file. Please specify a domain name.');
    }

    if (!hostname) {
      throw new Error('No `hostname` specified in configuration file. Please specify a hostname.');
    }

    baseRequest.interceptors.request.use((config) => {
      config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    });

    console.info('Updating domain records...');
    await updateDomainRecords(domain, hostname);
    console.info('Done!');
  }
  catch (e: any) {
    if ('message' in e) {
      console.error(e.message);
    }
    console.error('An unexpected error has occurred');
    Deno.exit(1);
  }
})();
