import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CompteService } from '../compte.service';
import { Compte, CompteCreateRequest, CompteUpdateRequest } from '../../models/compte.model';

describe('CompteService', () => {
  let service: CompteService;
  let httpMock: HttpTestingController;
  const apiUrl = '/api/comptes';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CompteService]
    });
    service = TestBed.inject(CompteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllComptes', () => {
    it('should retrieve all comptes', () => {
      const mockComptes: Compte[] = [
        { id: 1, numeroCompte: 'ACC-001', solde: 1000, dateDerniereMaj: '2024-01-15', pays: 'CI' },
        { id: 2, numeroCompte: 'ACC-002', solde: 2000, dateDerniereMaj: '2024-01-16', pays: 'SN' }
      ];

      service.getAllComptes().subscribe(comptes => {
        expect(comptes).toEqual(mockComptes);
      });

      const req = httpMock.expectOne(apiUrl);
      expect(req.request.method).toBe('GET');
      req.flush(mockComptes);
    });

    it('should include module context header when provided', () => {
      service.getAllComptes('Comptes').subscribe();

      const req = httpMock.expectOne(apiUrl);
      expect(req.request.headers.get('X-Permission-Module')).toBe('Comptes');
    });
  });

  describe('getCompteById', () => {
    it('should retrieve a compte by id', () => {
      const mockCompte: Compte = { id: 1, numeroCompte: 'ACC-001', solde: 1000, dateDerniereMaj: '2024-01-15', pays: 'CI' };

      service.getCompteById(1).subscribe(compte => {
        expect(compte).toEqual(mockCompte);
      });

      const req = httpMock.expectOne(`${apiUrl}/1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockCompte);
    });
  });

  describe('getCompteByNumero', () => {
    it('should retrieve a compte by numero', () => {
      const mockCompte: Compte = { id: 1, numeroCompte: 'ACC-001', solde: 1000, dateDerniereMaj: '2024-01-15', pays: 'CI' };

      service.getCompteByNumero('ACC-001').subscribe(compte => {
        expect(compte).toEqual(mockCompte);
      });

      const req = httpMock.expectOne(`${apiUrl}/numero/ACC-001`);
      expect(req.request.method).toBe('GET');
      req.flush(mockCompte);
    });
  });

  describe('createCompte', () => {
    it('should create a new compte', () => {
      const createRequest: CompteCreateRequest = {
        numeroCompte: 'NEW-001',
        solde: 5000,
        pays: 'CI',
        codeProprietaire: 'PROP001'
      };
      const createdCompte: Compte = { id: 3, ...createRequest, dateDerniereMaj: '2024-01-17' };

      service.createCompte(createRequest).subscribe(compte => {
        expect(compte).toEqual(createdCompte);
      });

      const req = httpMock.expectOne(apiUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(createRequest);
      req.flush(createdCompte);
    });
  });

  describe('updateCompte', () => {
    it('should update an existing compte', () => {
      const updateRequest: CompteUpdateRequest = {
        solde: 7500,
        codeProprietaire: 'PROP002'
      };
      const updatedCompte: Compte = { id: 1, numeroCompte: 'ACC-001', solde: 7500, dateDerniereMaj: '2024-01-15', pays: 'CI', codeProprietaire: 'PROP002' };

      service.updateCompte(1, updateRequest).subscribe(compte => {
        expect(compte).toEqual(updatedCompte);
      });

      const req = httpMock.expectOne(`${apiUrl}/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateRequest);
      req.flush(updatedCompte);
    });
  });

  describe('deleteCompte', () => {
    it('should delete a compte', () => {
      const deleteResponse = { success: true, message: 'Compte supprimé' };

      service.deleteCompte(1).subscribe(response => {
        expect(response).toEqual(deleteResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(deleteResponse);
    });
  });

  describe('checkCompteExists', () => {
    it('should check if compte exists', () => {
      service.checkCompteExists('ACC-001').subscribe(exists => {
        expect(exists).toBeTrue();
      });

      const req = httpMock.expectOne(`${apiUrl}/exists/ACC-001`);
      expect(req.request.method).toBe('GET');
      req.flush(true);
    });
  });

  describe('filterComptes', () => {
    it('should filter comptes with parameters', () => {
      const filter = { pays: 'CI', codeProprietaire: 'PROP001' };
      const mockComptes: Compte[] = [
        { id: 1, numeroCompte: 'ACC-001', solde: 1000, dateDerniereMaj: '2024-01-15', pays: 'CI', codeProprietaire: 'PROP001' }
      ];

      service.filterComptes(filter).subscribe(comptes => {
        expect(comptes).toEqual(mockComptes);
      });

      const req = httpMock.expectOne(req => req.url === `${apiUrl}/filter` && req.params.has('pays'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('pays')).toBe('CI');
      expect(req.request.params.get('codeProprietaire')).toBe('PROP001');
      req.flush(mockComptes);
    });
  });
});