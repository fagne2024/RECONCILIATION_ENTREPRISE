package com.reconciliation.mapper;

import com.reconciliation.dto.OperationCreateRequest;
import com.reconciliation.dto.OperationDTO;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.OperationEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
@SpringBootTest(classes = OperationMapperImpl.class)
class OperationMapperTest {

    @Autowired
    private OperationMapper mapper;

    @Test
    void shouldMapRequestToEntity() {
        // Given
        OperationCreateRequest request = new OperationCreateRequest();
        request.setCompteId(1L);
        request.setTypeOperation("DEPOT");
        request.setMontant(500.0);
        request.setBanque("ECOBANK");
        request.setNomBordereau("BORD-001");
        request.setService("MOBILE_MONEY");
        request.setDateOperation("2024-01-15T10:30:00");
        request.setRecordCount(10);
        request.setParentOperationId(null);
        request.setReferenceType("STANDARD");

        // When
        OperationEntity entity = mapper.toEntity(request);

        // Then
        assertThat(entity).isNotNull();
        assertThat(entity.getTypeOperation()).isEqualTo("DEPOT");
        assertThat(entity.getMontant()).isEqualTo(500.0);
        assertThat(entity.getBanque()).isEqualTo("ECOBANK");
        assertThat(entity.getNomBordereau()).isEqualTo("BORD-001");
        assertThat(entity.getService()).isEqualTo("MOBILE_MONEY");
        assertThat(entity.getDateOperation()).isEqualTo(LocalDateTime.of(2024, 1, 15, 10, 30));
        assertThat(entity.getRecordCount()).isEqualTo(10);
        assertThat(entity.getId()).isNull();
        assertThat(entity.getCompte()).isNull();
    }

    @Test
    void shouldMapEntityToDTO() {
        // Given
        CompteEntity compte = new CompteEntity();
        compte.setId(1L);
        compte.setNumeroCompte("ACC-001");

        OperationEntity entity = new OperationEntity();
        entity.setId(100L);
        entity.setTypeOperation("RETRAIT");
        entity.setDateOperation(LocalDateTime.of(2024, 1, 15, 10, 30));
        entity.setCodeProprietaire("PROP001");
        entity.setService("MOBILE_MONEY");
        entity.setMontant(200.0);
        entity.setSoldeAvant(1000.0);
        entity.setSoldeApres(800.0);
        entity.setNomBordereau("BORD-002");
        entity.setBanque("ECOBANK");
        entity.setStatut("VALIDATED");
        entity.setPays("CI");
        entity.setRecordCount(5);
        entity.setParentOperationId(null);
        entity.setReference("REF-001");
        entity.setCompte(compte);

        // When
        OperationDTO dto = mapper.toDTO(entity);

        // Then
        assertThat(dto).isNotNull();
        assertThat(dto.getId()).isEqualTo(100L);
        assertThat(dto.getTypeOperation()).isEqualTo("RETRAIT");
        assertThat(dto.getDateOperation()).isEqualTo(LocalDateTime.of(2024, 1, 15, 10, 30));
        assertThat(dto.getCodeProprietaire()).isEqualTo("PROP001");
        assertThat(dto.getService()).isEqualTo("MOBILE_MONEY");
        assertThat(dto.getMontant()).isEqualTo(200.0);
        assertThat(dto.getSoldeAvant()).isEqualTo(1000.0);
        assertThat(dto.getSoldeApres()).isEqualTo(800.0);
        assertThat(dto.getNomBordereau()).isEqualTo("BORD-002");
        assertThat(dto.getBanque()).isEqualTo("ECOBANK");
        assertThat(dto.getStatut()).isEqualTo("VALIDATED");
        assertThat(dto.getPays()).isEqualTo("CI");
        assertThat(dto.getRecordCount()).isEqualTo(5);
        assertThat(dto.getCompteId()).isEqualTo(1L);
        assertThat(dto.getCompteNumero()).isEqualTo("ACC-001");
    }

    @Test
    void shouldUpdateEntityFromRequest() {
        // Given
        OperationEntity entity = new OperationEntity();
        entity.setId(1L);
        entity.setTypeOperation("OLD_TYPE");
        entity.setMontant(100.0);
        entity.setBanque("OLD_BANK");

        OperationCreateRequest request = new OperationCreateRequest();
        request.setTypeOperation("NEW_TYPE");
        request.setMontant(300.0);
        request.setBanque("NEW_BANK");
        request.setDateOperation("2024-02-20T14:00:00");

        // When
        mapper.updateEntityFromRequest(request, entity);

        // Then
        assertThat(entity.getId()).isEqualTo(1L);
        assertThat(entity.getTypeOperation()).isEqualTo("NEW_TYPE");
        assertThat(entity.getMontant()).isEqualTo(300.0);
        assertThat(entity.getBanque()).isEqualTo("NEW_BANK");
        assertThat(entity.getDateOperation()).isEqualTo(LocalDateTime.of(2024, 2, 20, 14, 0));
    }
}