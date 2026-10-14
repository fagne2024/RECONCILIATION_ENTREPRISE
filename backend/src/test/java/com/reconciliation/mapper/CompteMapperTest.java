package com.reconciliation.mapper;

import com.reconciliation.dto.CompteDTO;
import com.reconciliation.entity.CompteEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
@SpringBootTest(classes = CompteMapperImpl.class)
class CompteMapperTest {

    @Autowired
    private CompteMapper mapper;

    @Test
    void shouldMapDTOToEntity() {
        // Given
        CompteDTO dto = new CompteDTO();
        dto.setNumeroCompte("123456789");
        dto.setSolde(1000.0);
        dto.setDateDerniereMaj(LocalDateTime.now());
        dto.setPays("CI");
        dto.setCodeProprietaire("PROP001");
        dto.setAgence("ABIDJAN");
        dto.setType("EPARGNE");
        dto.setCategorie("PARTICULIER");

        // When
        CompteEntity entity = mapper.toEntity(dto);

        // Then
        assertThat(entity).isNotNull();
        assertThat(entity.getNumeroCompte()).isEqualTo("123456789");
        assertThat(entity.getSolde()).isEqualTo(1000.0);
        assertThat(entity.getPays()).isEqualTo("CI");
        assertThat(entity.getCodeProprietaire()).isEqualTo("PROP001");
        assertThat(entity.getAgence()).isEqualTo("ABIDJAN");
        assertThat(entity.getType()).isEqualTo("EPARGNE");
        assertThat(entity.getCategorie()).isEqualTo("PARTICULIER");
        assertThat(entity.getId()).isNull();
    }

    @Test
    void shouldMapEntityToDTO() {
        // Given
        CompteEntity entity = new CompteEntity();
        entity.setId(1L);
        entity.setNumeroCompte("123456789");
        entity.setSolde(1000.0);
        entity.setDateDerniereMaj(LocalDateTime.now());
        entity.setPays("CI");
        entity.setCodeProprietaire("PROP001");
        entity.setAgence("ABIDJAN");
        entity.setType("EPARGNE");
        entity.setCategorie("PARTICULIER");

        // When
        CompteDTO dto = mapper.toDTO(entity);

        // Then
        assertThat(dto).isNotNull();
        assertThat(dto.getId()).isEqualTo(1L);
        assertThat(dto.getNumeroCompte()).isEqualTo("123456789");
        assertThat(dto.getSolde()).isEqualTo(1000.0);
        assertThat(dto.getPays()).isEqualTo("CI");
        assertThat(dto.getCodeProprietaire()).isEqualTo("PROP001");
        assertThat(dto.getAgence()).isEqualTo("ABIDJAN");
        assertThat(dto.getType()).isEqualTo("EPARGNE");
        assertThat(dto.getCategorie()).isEqualTo("PARTICULIER");
    }

    @Test
    void shouldUpdateEntityFromDTO() {
        // Given
        CompteEntity entity = new CompteEntity();
        entity.setId(1L);
        entity.setNumeroCompte("OLD123");
        entity.setSolde(500.0);
        entity.setPays("SN");

        CompteDTO dto = new CompteDTO();
        dto.setNumeroCompte("NEW456");
        dto.setSolde(2000.0);
        dto.setPays("CI");

        // When
        mapper.updateEntityFromDTO(dto, entity);

        // Then
        assertThat(entity.getId()).isEqualTo(1L);
        assertThat(entity.getNumeroCompte()).isEqualTo("NEW456");
        assertThat(entity.getSolde()).isEqualTo(2000.0);
        assertThat(entity.getPays()).isEqualTo("CI");
    }
}