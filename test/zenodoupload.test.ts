import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { dir } from 'tmp-promise';

import zenodo_upload from '../src';

jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');
// const realFetch = jest.requireActual('node-fetch');

const mockedfetch = (fetch as any) as jest.Mock;

const mockedZenodoSandboxAPI = async (url: string, init: RequestInit) => {
  if (
    url ===
    'https://sandbox.zenodo.org/api/deposit/depositions/1234567/actions/newversion'
  ) {
    const response: any = {
      links: {
        latest_draft:
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321',
      },
    };
    const response_init = {
      status: 201,
      statusText: 'Created',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    return new Response(JSON.stringify(response), response_init);
  } else if (
    url === 'https://sandbox.zenodo.org/api/deposit/depositions/7654321' &&
    init.method === 'GET'
  ) {
    const response: any = {
      links: {
        bucket:
          'https://sandbox.zenodo.org/api/files/1e1986e8-f4d5-4d17-91be-2159f9c62b13',
      },
      metadata: {
        version: '0.1.0',
      },
    };
    const response_init = {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    return new Response(JSON.stringify(response), response_init);
  } else if (
    url ===
    'https://sandbox.zenodo.org/api/files/1e1986e8-f4d5-4d17-91be-2159f9c62b13/somefile.txt'
  ) {
    const response = {
      id: 'fileid1',
      filename: 'somefile.txt',
      filesize: 9,
      checksum: '4e74fa271381933159558bf36bed0a50',
    };
    const response_init = {
      status: 201,
      statusText: 'Created',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    return new Response(JSON.stringify(response), response_init);
  } else if (
    url === 'https://sandbox.zenodo.org/api/deposit/depositions/7654321' &&
    init.method === 'PUT'
  ) {
    const response: any = {
      metadata: {
        version: '1.2.3',
      },
    };
    const response_init = {
      status: 200,
      statusText: 'Accepted',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    return new Response(JSON.stringify(response), response_init);
  } else if (
    url ===
    'https://sandbox.zenodo.org/api/deposit/depositions/7654321/actions/publish'
  ) {
    const response: any = {
      id: 7654321,
      links: {
        latest_html: 'https://sandbox.zenodo.org/record/7654321',
        doi: 'https://doi.org/10.5072/zenodo.7654321',
      },
      metadata: {
        version: '1.2.3',
      },
    };
    const response_init = {
      status: 202,
      statusText: 'Accepted',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    return new Response(JSON.stringify(response), response_init);
  }
  throw new Error('URL not mocked, ' + url);
};

describe('zenodo_upload()', () => {
  describe('with a dummy file', () => {
    let dummy_file: string;
    let cleanup: () => Promise<void>;
    beforeAll(async () => {
      const result = await dir();
      cleanup = result.cleanup;
      dummy_file = path.join(result.path, 'somefile.txt');
      await fs.promises.writeFile(dummy_file, 'sometext', 'utf8');
    });

    afterAll(async () => {
      await cleanup();
    });

    describe('against a mocked Zenodo sandbox API', () => {
      let result: any;

      beforeAll(async () => {
        mockedfetch.mockImplementation(mockedZenodoSandboxAPI);

        result = await zenodo_upload(
          1234567,
          dummy_file,
          '1.2.3',
          'sometoken',
          true
        );
      });

      it('should create a draft deposition', () => {
        const expected_url =
          'https://sandbox.zenodo.org/api/deposit/depositions/1234567/actions/newversion';
        const expected_init = {
          method: 'POST',
          headers: {
            Authorization: 'Bearer sometoken',
          },
        };
        expect(fetch).toHaveBeenCalledWith(expected_url, expected_init);
      });

      it('should retrieve deposition of new version', () => {
        const expected_url =
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321';
        const expected_init = {
          method: 'GET',
          headers: {
            Authorization: 'Bearer sometoken',
          },
        };
        expect(fetch).toBeCalledWith(expected_url, expected_init);
      });

      it('should upload file to Zenodo', () => {
        const expected_url =
          'https://sandbox.zenodo.org/api/files/1e1986e8-f4d5-4d17-91be-2159f9c62b13/somefile.txt';
        expect(fetch).toBeCalledWith(expected_url, expect.anything());
        // TODO check headers
      });

      it('should set the version to the current date', () => {
        const expected_url =
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321';

        const expected_init = {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer sometoken',
            'Content-Type': 'application/json',
          },
          body: expect.anything(),
        };
        expect(fetch).toBeCalledWith(expected_url, expected_init);
        const recieved_init = mockedfetch.mock.calls.find(
          args => args[0] === expected_url && args[1].method === 'PUT'
        )[1];
        const expected_version = '1.2.3';
        const version = JSON.parse(recieved_init.body).metadata.version;
        expect(version).toEqual(expected_version);
      });

      it('should return the identifier new version', () => {
        const expected_id = 7654321;
        expect(result.id).toEqual(expected_id);
      });

      it('should return the html url of the new version', () => {
        const expected_url = 'https://sandbox.zenodo.org/record/7654321';
        expect(result.html).toEqual(expected_url);
      });

      it('should return the doi of the new version', () => {
        const expected_doi = 'https://doi.org/10.5072/zenodo.7654321';
        expect(result.doi).toEqual(expected_doi);
      });
    });

    describe('against a broken Zenodo API', () => {
      describe.each([
        [
          'when wrong deposition id is given',
          'https://sandbox.zenodo.org/api/deposit/depositions/1234567/actions/newversion',
          'POST',
        ],
        [
          'when retrieving new deposition fails',
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321',
          'GET',
        ],
        [
          'when upload fails',
          'https://sandbox.zenodo.org/api/files/1e1986e8-f4d5-4d17-91be-2159f9c62b13/somefile.txt',
          'PUT',
        ],
        [
          'when setting new version fails',
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321',
          'PUT',
        ],
        [
          'when publishing fails',
          'https://sandbox.zenodo.org/api/deposit/depositions/7654321/actions/publish',
          'POST',
        ],
      ])('should throw error', (why, broken_url, broken_method) => {
        it(why, async () => {
          expect.assertions(1);
          mockedfetch.mockImplementation((url, init) => {
            if (url === broken_url && init.method === broken_method) {
              return new Response('error', {
                status: 404,
                statusText: 'Not found',
              });
            }
            return mockedZenodoSandboxAPI(url, init);
          });

          try {
            await zenodo_upload(
              1234567,
              dummy_file,
              '1.2.3',
              'sometoken',
              true
            );
          } catch (error) {
            expect(error).toEqual(
              new Error('Zenodo API communication error: Not found')
            );
          }
        });
      });
    });
  });

  describe('with a non-existing file', () => {});
});
